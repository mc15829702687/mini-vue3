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
const data = {
  foo: 1,
};
// 3. 由于副作用函数名字是写死的，所以用 activeEffect 存储副作用函数
let activeEffect;
// 副作用函数栈
let effectStack = [];

let ITERATE_KEY = Symbol();

// 2. 对原始数据读取与设置
// 存放副作用函数的桶
let bucket = new WeakMap();
let obj = new Proxy(data, {
  get(target, key, receiver) {
    // 将副作用函数存储到 桶中
    track(target, key);

    // 使用 Reflect 解决 this 指向
    return Reflect.get(target, key, receiver);
    // return target[key];
  },
  set(target, key, value, receiver) {
    // 如果属性不存在，则说明是新增，否则是修改属性
    const type = Object.prototype.hasOwnProperty.call(target, key)
      ? "SET"
      : "ADD";
    // 先付新值
    // 使用 Reflect 解决 this 指向
    Reflect.set(target, key, value, receiver);
    // target[key] = value;
    // 取出桶中的副作用函数，并执行
    // 将 type 作为第三个参数传递给 trigger 函数
    trigger(target, key, type);
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
    track(target, ITERATE_KEY);
    return Reflect.ownKeys(target);
  },
  // delete 操作
  deleteProperty(target, key) {
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
function trigger(target, key, type) {
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
effect(() => {
  for (const key in obj) {
    console.log("run effect, key: ", key);
  }
});

// add
// obj.bar = true;
// set
// obj.foo = 2;
// delete
delete obj.foo;
