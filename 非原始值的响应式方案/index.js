// 1. 副作用函数-产生副作用影响的函数，包括全局变量修改，全局属性修改等
// const data = {
//   text: "Hello Vue3",
//   ok: true,
//   bar: true,
//   foo: true,
//   foo2: 1, // 避免无线递归循环
//   get baz() {
//     return this.foo;
//   },
// };
// const data = {
//   foo: 1,
// };
// 3. 由于副作用函数名字是写死的，所以用 activeEffect 存储副作用函数
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
  if (!activeEffect) return target[key];
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

// 二、非原始值的响应式方法
// 1. 使用 Reflect 解决代理对象 this 指向问题
// effect(() => {
//   console.log(obj.baz);
// });

// obj.foo++;

// 2. 如何代理 Object
/**
 * 对一个普通对象的读取操作：
 * 1) 访问属性：obj.foo
 * 2) 判断对象或原型上是否存在给定的 key: key in obj
 * 3) 使用 for...in 循环遍历对象: for(const key in obj) {}
 */
// effect(() => {
//   if ("foo" in obj) {
//     console.log("foo in obj");
//   }
// });

// for...in 循环
// effect(() => {
//   for (const key in obj) {
//     console.log("run effect, key: ", key);
//   }
// });

// add
// obj.bar = true;
// set
// obj.foo = 2;
// delete
// delete obj.foo;

// 3. 合理的触发响应
// 3.1) 当值没变时不需要触发副作用函数
// 3.2）新值与旧值不都是 NaN
// effect(() => {
//   console.log('----', obj.foo);
// });
// obj.foo = 1;

// 3.3) 继承
// const obj = {};
// const proto = { bar: 1 };
// const child = reactive(obj);
// const parent = reactive(proto);
// Object.setPrototypeOf(child, parent);

// effect(() => {
//   console.log('---', child.bar);
// })

// child.bar = 2;

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
// const obj = reactive({ foo: { bar: 1 } });
// const shallowObj = shallowReactive({ foo: { bar: 1 } });


// obj.foo.bar = 2;
// obj.foo = { bar: 3 }

// 5. 只读和浅只读
function readOnly(data) {
  return createReactive(data, false, true);
}
function shallowReadOnly(data) {
  return createReactive(data, true, true);
}
// const obj = readOnly({ foo: { bar: 1 } });
// const obj = shallowReadOnly({ foo: { bar: 1 } });
// effect(() => {
//   console.log(obj.foo.bar);
// })
// obj.foo.bar = 2;

// 6. 数组的索引与length
// const arr = reactive(['foo']);
// effect(() => {
//   console.log(arr[0]);
// })
// // arr[1] = 'bar';
// arr.length = 0;

// 7. 遍历数组
// 1. for...in 循环
// const arr = reactive(['foo']);
// effect(() => {
//   for (let key in arr) {
//     console.log('key', key);
//   }
// })
// console.log('---', Array.prototype.values === Array.prototype[Symbol.iterator]);
// arr[100] = 100;
// arr.length = 2;

// 2.for...of 循环
// for...of 是来遍历迭代对象的，一个对象能否被迭代，取决于该对象或对象的原型上是否实现了Symbol.iterator 这个方法
// 模拟一个数组的迭代器 
// const arr = reactive([1, 2, 3]);
// arr[Symbol.iterator] = function () {
//   const target = this;
//   const len = target.length;
//   let index = 0;

//   return {
//     value: index < len ? target[index] : undefined,
//     done: index++ >= len
//   }
// }
// effect(() => {
//   for (let v of arr) {
//     console.log('v', v);
//   }
// })

// arr[1] = 'bar';
// arr.length = 0;

// 8. 数组的查找方法
// 8.1 访问数组的 length 属性
// const arr = reactive([1, 2]);

// effect(() => {
//   console.log(arr.includes(1));
// })
// arr[0] = 3;   // 会触发副作用函数执行，会访问数组的 length 属性

// 8.2 arr[0]拿到的始终是新的代理对象
const obj = {};
const arr = reactive([obj]);
// console.log(arr.includes(arr[0]));    // true
console.log(arr.includes(obj));   // false 因为 includes 内部的 this 指向的是代理对象 arr,并且在获取数组元素时得到的值也是代理对象，为此需要重写 includes 方法