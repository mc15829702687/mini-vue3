
let activeEffect;
// 副作用函数栈
let effectStack = [];

let ITERATE_KEY = Symbol();

// 2. 对原始数据读取与设置
// 存放副作用函数的桶
let bucket = new WeakMap();

// 数组重写的方法
const arrayInstrumentations = {};

;['includes', 'indexOf', 'lastIndexOf'].forEach(method => {
  const originMethod = Array.prototype[method];

  arrayInstrumentations[method] = function (...args) {
    // this 是代理对象，先在代理对象中查找，将结果存储到 res 中
    let res = originMethod.apply(this, args);

    // 如果没找到，通过 raw 属性，在原始对象中查找
    if (res === false || res === -1) {
      res = originMethod.apply(this.raw, args);
    }

    // 返回最终结果
    return res;
  }
});

// 一个标记变量，代表是否进行追踪，默认值为 true, 即允许进行追踪
let shouldTrack = true;
;['push', 'pop', 'shift', 'unshift', 'splice'].forEach(method => {
  const originMethod = Array.prototype[method];
  arrayInstrumentations[method] = function (...args) {
    // 在调用之前禁止追踪
    shouldTrack = false;
    let res = originMethod.apply(this, args);
    // 调用之后允许追踪
    shouldTrack = true;
    return res;
  }
})

/**
 * 
// 封装 createReactive 函数
 * @param {*} data 
 * @param {代表是否是浅响应} isShallow 
 * @param {代表是否是只读，只读在set和Del时打印警告} isReadOnly 
 * @returns 
 */
const createReactive = (data, isShallow = false, isReadOnly = false) => {
  return new Proxy(data, {
    get(target, key, receiver) {
      // 代理对象可以通过 raw 属性访问原始数据
      if (key === 'raw') {
        return target;
      }

      // 如果操作的目标对象是数组，并且 key 存在于 arrayInstrumentations 上，
      // 那么返回定义在 arrayInstrumentations 上的值
      if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(key)) {
        return Reflect.get(arrayInstrumentations, key, receiver);
      }

      // 非只读建立响应连接
      if (!isReadOnly && typeof key !== 'symbol') {
        // 将副作用函数存储到 桶中
        track(target, key);
      }

      // 使用 Reflect 解决 this 指向
      const res = Reflect.get(target, key, receiver);

      // 如果是浅响应直接返回原始值
      if (isShallow) {
        return res;
      }

      // 深响应
      if (typeof res === 'object' && res !== null) {
        // 如果数据为只读，则调用 readOnly 进行递归调用
        return isReadOnly ? readOnly(res) : reactive(res);
      }

      return res;
      // return target[key];
    },
    set(target, key, value, receiver) {
      // 如果是只读选项，打印警告并返回
      if (isReadOnly) {
        console.warn(`属性${key}是只读的`);
        return true;
      }

      const oldVal = target[key];
      // 如果属性不存在，则说明是新增，否则是修改属性
      // 先判断是否是数组，再比较下标与当前数组长度，小于是 'SET', 大于是 'ADD'
      const type = Array.isArray(target) ?
        Number(key) < target.length ? 'SET' : 'ADD' :
        Object.prototype.hasOwnProperty.call(target, key)
          ? "SET"
          : "ADD";
      // 先付新值
      // 使用 Reflect 解决 this 指向
      Reflect.set(target, key, value, receiver);
      // target[key] = value;
      // 取出桶中的副作用函数，并执行
      // target === receiver.raw，说明 receiver 就是 target 的代理对象
      if (receiver.raw === target) {
        // 当旧值与新值不一样时，才触发副作用函数，并且旧值和新值不都是 NaN
        if (oldVal !== value && oldVal === oldVal && value === value) {
          // 将 type 作为第三个参数传递给 trigger 函数
          // 将新值作为第四个参数传递给 trigger 函数，用于改变数组的length监听
          trigger(target, key, type, value);
        }
      }

      return true;
    },
    // key in obj, in 操作符建立连接
    has(target, key) {
      track(target, key);
      return Reflect.has(target, key);
    },
    // for...in
    ownKeys(target) {
      // 将 副作用函数与 ITERATE_KEY 关联
      track(target, Array.isArray(target) ? 'length' : ITERATE_KEY);
      return Reflect.ownKeys(target);
    },
    // delete 操作
    deleteProperty(target, key) {
      // 如果是只读选项，打印警告并返回
      if (isReadOnly) {
        console.warn(`属性${key}是只读的`);
        return true;
      }
      // 检查对象上是否存在该属性
      const hadKey = Object.prototype.hasOwnProperty.call(target, key);
      // 完成对属性的删除
      const res = Reflect.deleteProperty(target, key);

      // 只有上述两个条件都成立时，才触发更新
      if (hadKey && res) {
        trigger(target, key, "DELETE");
      }
      return res;
    },
  });
}

// 在 get 函数内调用 track 函数追踪变化
function track(target, key) {
  // 如果没有 activeEffect 直接 return
  // 禁止追踪时，直接返回
  if (!activeEffect || !shouldTrack) return target[key];
  // 从桶里取出 depsMap,它也是一个 Map 类型，key => effects
  let depsMap = bucket.get(target);
  if (!depsMap) {
    bucket.set(target, (depsMap = new Map()));
  }
  // 再根据 key 从 depsMap 里取得 deps，它是一个 Set 类型的数据
  // 是一个副作用函数的集合
  let deps = depsMap.get(key);
  if (!deps) {
    depsMap.set(key, (deps = new Set()));
  }

  // 读取时将副作用函数放进桶里
  deps.add(activeEffect);
  // deps 就是一个与当前副作用函数相关联的依赖集合
  // 将其 push 到 activeEffect.deps 数组中
  activeEffect.deps.push(deps);
}

// 执行桶中的副作用函数
function trigger(target, key, type, newValue) {
  // 根据 target 从桶中取得 depsMap，它是：Key => effects
  const depsMap = bucket.get(target);
  if (!depsMap) return;
  // 取得副作用函数的集合
  const effects = depsMap.get(key);

  //  防止死循环，原因：副作用函数还没遍历完，就被收集了
  const effectsToRun = new Set();
  effects &&
    effects.forEach((effectFn) => {
      if (activeEffect !== effectFn) {
        effectsToRun.add(effectFn);
      }
    });

  if (type === "ADD" || type === "DELETE") {
    // 取得与 ITERATE_KEY 相关联的副作用函数
    const iterateEffects = depsMap.get(ITERATE_KEY);
    // 将与 ITERATE_KEY 相关联的副作用函数也添加到 effectsToRun 里
    iterateEffects &&
      iterateEffects.forEach((effectFn) => {
        if (activeEffect !== effectFn) {
          effectsToRun.add(effectFn);
        }
      });
  }

  // 判断是否是数组，并且还是添加操作
  if (Array.isArray(target) && type === 'ADD') {
    // 获取到 length 属性的副作用函数
    const lengthEffects = depsMap.get('length');
    lengthEffects && lengthEffects.forEach(effectFn => {
      if (activeEffect !== effectFn) {
        effectsToRun.add(effectFn);
      }
    })
  }

  // 判断是否是数组，并且是修改 length 属性
  if (Array.isArray(target) && key === 'length') {
    depsMap.forEach((effects, key) => {
      // 对于索引大于等于 length 值的元素
      // 需要把相关联的副作用函数提取出来并添加到 effectsToRun 中待执行
      if (key >= newValue) {
        effects.forEach(effectFn => {
          if (activeEffect !== effectFn) {
            effectsToRun.add(effectFn);
          }
        })
      }
    })
  }

  effectsToRun.forEach((effectFn) => {
    // 如果存在调度器，先执行调度器，否则原样执行
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn);
    } else {
      effectFn();
    }
  });
  // 从桶里取出副作用函数并执行
  //  effects && effects.forEach(effectFn => effectFn());
}

// 匿名函数也能执行，不必依赖 effect 函数名
// 问题：分支切换会造成每次不必要的副作用函数执行
// 解决方法：每次副作用函数执行时，清除与之关联的依赖集合，副作用函数执行完后，重新建立连接
function effect(fn, options = {}) {
  const effectFn = () => {
    // 调用 cleanup 完成清除工作
    cleanup(effectFn);
    // 设置为当前激活的 effect 函数
    activeEffect = effectFn;
    // 在副作用函数执行前，将当前副作用函数压入栈中
    effectStack.push(activeEffect);
    // 执行副作用函数
    const res = fn();
    // 待副作用函数执行完后，将当前副作用函数弹出栈中，并把 activeEffect 还原为之前的值
    effectStack.pop();
    // 重新赋值
    activeEffect = effectStack[effectStack.length - 1];
    return res;
  };

  // 用来存储所有与副作用函数相关联的依赖集合
  effectFn.deps = [];
  // 将配置项挂载到副作用函数上
  effectFn.options = options;

  // 只有非 lazy 时才执行副作用函数
  if (!options.lazy) {
    effectFn();
  }

  // 返回副作用函数
  return effectFn;
}

function cleanup(effectFn) {
  for (let i = 0; i < effectFn.deps.length; i++) {
    // deps 是依赖集合
    const deps = effectFn.deps[i];
    // 将 effectFn 从依赖集合中移除
    deps.delete(effectFn);
  }
  // 最后将 effectFn.deps 置为空
  effectFn.deps.length = 0;
}

// 6.2 执行次数
// 定义一个任务队列
const jobQueue = new Set();
// 使用 Promise.resolve() 创建一个 promise 实例，用它将一个任务添加到微任务队列
const p = Promise.resolve();

// 一个标志代表是否正在刷新任务队列
let isFlushing = false;
function flushJob() {
  // 如果正在刷新任务队列，什么也不做
  if (isFlushing) return;
  // 代表正在刷新任务队列
  isFlushing = true;
  // 在微任务队列中刷新 jobQueue 队列
  p.then(() => {
    jobQueue.forEach((job) => job());
  }).finally(() => {
    isFlushing = false;
  });
}

// 实现 computed 函数
function computed(getter) {
  // 用来记录上一次的值
  let value;
  // 用来判断是否需要重新调用副作用函数，true 就意味着脏，代表重新计算
  let dirty = true;

  // 将 getter 做为副作用函数
  const effectFn = effect(getter, {
    lazy: true,
    scheduler() {
      dirty = true;
      // 当计算属性的响应式数据发生变化时，手动调用 trigger 函数触发响应
      trigger(obj, "value");
    },
  });

  const obj = {
    get value() {
      // 只有当 dirty 为 true 时，才需要重新计算
      if (dirty) {
        value = effectFn();
        // 将 dirty 设置为 false，下次直接访问上次缓存的值
        dirty = true;
        // 当读取时，手动调用 track 函数进行追踪
        track(obj, "value");
      }
      return value;
    },
  };

  return obj;
}

// 8. watch 函数
function traverse(value, seen = new Set()) {
  // 如果要读取的数据是原始类型，或者已经被读取过了，什么也不做
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  // 将数据添加到 seen 中，表示已经读取过了
  seen.add(value);
  // 如果是对象，则递归调用
  for (let key in value) {
    traverse(value[key], seen);
  }

  return value;
}
function watch(source, cb, options = {}) {
  // 定义 getter
  let getter;
  if (typeof source === "function") {
    // 如果 source 是函数，说明用户传递的是 getter，则直接把 source 赋值给 getter
    getter = source;
  } else {
    // 调用 traverse函数递归的读取每个属性，做依赖追踪
    getter = () => traverse(source);
  }

  // 定义存储过期回调函数
  let cleanup;

  const onInvalidate = (fn) => {
    // 将过期回调存储到 cleanup 中
    cleanup = fn;
  };

  // 调度执行函数
  const job = () => {
    // 在 scheduler 中重新执行副作用函数，得到的是新值
    newValue = effectFn();
    // 在调用回调函数前先执行过期回调
    if (cleanup) {
      cleanup();
    }
    // 将新值和旧值作为回调参数
    cb(newValue, oldValue, onInvalidate);
    // 更新旧值
    oldValue = newValue;
  };

  // 定义旧值与新值
  let newValue, oldValue;
  const effectFn = effect(getter, {
    lazy: true,
    scheduler() {
      // flush 为 post，放到 微任务队列中执行
      if (options.flush === "post") {
        const p = Promise.resolve();
        p.then(job);
      } else {
        job();
      }
    },
  });

  if (options.immediate) {
    // 当 immediate 为 true 时，直接执行 job，从而触发回调执行
    job();
  } else {
    // 手动调用副作用函数拿到第一次的旧值
    oldValue = effectFn();
  }
}

// 定义一个 Map 实例，存储原始对象到代理对象的映射
const reactiveMap = new Map();
// 4. 浅响应与深响应
const reactive = (obj) => {
  // 优先通过原始对象 obj，寻找代理对象，存在直接返回
  const exisionProxy = reactiveMap.get(obj);
  if (exisionProxy) {
    return exisionProxy;
  }

  // 否则，则创建新的代理对象
  const proxy = createReactive(obj);
  // 存储到 Map 中，从而避免重复创建
  reactiveMap.set(obj, proxy);

  return proxy;
}
const shallowReactive = (data) => {
  return createReactive(data, true);
}

//  只读和浅只读
function readOnly(data) {
  return createReactive(data, false, true);
}
function shallowReadOnly(data) {
  return createReactive(data, true, true);
}

// 1. ref 实现
function ref(val) {
  const wrapper = {
    value: val
  }

  //  区分一个数据是否为 ref
  // 定义了一个不可枚举的属性 __v_isRef，并且设置值为 true
  Object.defineProperty(wrapper, '__v_isRef', { value: true });
  return reactive(wrapper);
}

// const foo = ref(1);
// effect(() => {
//   console.log('foo', foo.value);
// })
// foo.value = 2;

// 2. 响应丢失问题
function toRef(obj, key) {
  const wrapper = {
    get value() {
      return obj[key];
    },
    // 允许设置值
    set value(val) {
      obj[key] = val;
    }
  }

  // 定义 __v_isRef 属性
  Object.defineProperty(wrapper, '__v_isRef', { value: true });

  return wrapper;
}
function toRefs(obj) {
  const ret = {};
  // 使用 for...in 遍历对象
  for (const key in obj) {
    // 使用 toRef 转换对象
    ret[key] = toRef(obj, key);
  }
  return ret;
}
const obj = reactive({ foo: 1, bar: 2 })
// const newObj = { ...toRefs(obj) };
// effect(() => {
//   console.log(newObj.foo.value);
// })
// obj.foo = 3;

// 3. 自动脱 ref
function proxyRefs(target) {
  return new Proxy(target, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      // 自动脱 ref 实现：如果读取的值是 ref，则返回它的 value 属性
      return value.__v_isRef ? value.value : value;
    },
    set(target, key, newValue, receiver) {
      // 通过 target 读取真实值
      const value = target[key];
      // 如果值是 ref，则设置其 value 属性
      if (value.__v_isRef) {
        value.value = newValue;
        return value;
      }
      return Reflect.set(target, key, newValue, receiver);
    }
  });
}
const newObj = proxyRefs({ ...toRefs(obj) });
console.log(newObj.foo);
console.log(newObj.bar);
newObj.foo = 200;
console.log(newObj.foo);

const count = ref(0);
const obj2 = reactive({ count });
console.log(obj2.count);

