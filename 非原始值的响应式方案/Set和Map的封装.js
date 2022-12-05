// 3. 由于副作用函数名字是写死的，所以用 activeEffect 存储副作用函数
let activeEffect;
// 副作用函数栈
let effectStack = [];

let ITERATE_KEY = Symbol();

// 2. 对原始数据读取与设置
// 存放副作用函数的桶
let bucket = new WeakMap();

// 定义一个对象，将自定义的 add 方法添加到该对象下
const mutableInstrumentations = {
  add(key) {
    // this 指向的是代理对象，通过 raw 属性获取原始对象
    const target = this.raw;
    // 判断值是否存在
    const hadKey = target.has(key);
    // 通过原始对象执行 add 方法添加具体的值
    const res = target.add(key);
    // 只有值不存在的时候触发响应
    if (!hadKey) {
      // 调用 trigger 方法触发响应，并指定类型为 ADD
      trigger(target, key, 'ADD');
    }
    // 返回操作结果
    return res;
  },
  delete(key) {
    // this 指向的是代理对象，通过 raw 属性获取原始对象
    const target = this.raw;
    // 判断值是否存在
    const hadKey = target.has(key);
    // 通过原始对象执行 add 方法添加具体的值
    const res = target.delete(key);
    // 只有值不存在的时候触发响应
    if (hadKey) {
      // 调用 trigger 方法触发响应，并指定类型为 ADD
      trigger(target, key, 'DELETE');
    }
    // 返回操作结果
    return res;
  }
}


// 在 createReactive 中封装代理 Set 和 Map 的逻辑
function createReactive(obj) {
  return new Proxy(obj, {
    get(target, key, receiver) {
      if (key === 'raw') return target;
      // 代理对象访问 size 属性，this 就是代理对象，而代理对象本身没有内部槽[[SetData]]
      // 所以拦截，让其 this 指向 本身
      if (key === 'size') {
        track(target, ITERATE_KEY);
        return Reflect.get(target, key, target);
      }

      return mutableInstrumentations[key];
    }
  })
}

const reactiveMap = new Map();
function reactive(obj) {
  const proxy = createReactive(obj);

  const existionProxy = reactiveMap.get(obj);
  if (existionProxy) return existionProxy;

  reactiveMap.set(obj, proxy);
  return proxy;
}

// 依赖收集
function track(target, key) {
  let depsMap = bucket.get(target);
  if (!depsMap) {
    bucket.set(target, depsMap = new Map());
  }
  let deps = depsMap.get(key);
  if (!deps) {
    depsMap.set(key, deps = new Set());
  }

  deps.add(activeEffect);
  activeEffect.deps.push(deps);
}

// 响应追踪
function trigger(target, key, type) {
  const depsMap = bucket.get(target);
  if (!depsMap) return;

  //  防止死循环，原因：副作用函数还没遍历完，就被收集了
  const effectsToRun = new Set();

  // 当操作类型 type 为 ADD 时，会取出与 ITERATE_KEY 相关联的副作用函数并执行
  if (type === 'ADD' || type === 'DELETE') {
    const iterateEffects = depsMap.get(ITERATE_KEY);
    iterateEffects && iterateEffects.forEach(effectFn => {
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn);
      }
    })
  }

  effectsToRun.forEach(effectFn => {
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn);
    } else {
      effectFn();
    }
  })
}

function cleanup(effectFn) {
  for (let i = 0; i < effectFn.deps.length; i++) {
    const deps = effectFn.deps[i];
    deps.delete(effectFn);
  }
  effectFn.deps.length = 0;
}

function effect(fn, options = {}) {
  const effectFn = () => {
    cleanup(effectFn);
    activeEffect = effectFn;
    effectStack.push(activeEffect);
    const res = fn();
    effectStack.pop();
    activeEffect = effectStack[effectStack.length - 1];
    return res;
  }

  effectFn.deps = [];
  effectFn.options = options;

  if (!options.lazy) {
    effectFn();
  }
  return effectFn;
}

// 1. 代理 Set 和 Map 的注意事项
// const p = reactive(new Set([1, 2, 3]))
// console.log(p.size);

// 2. 建立响应连接
const p = reactive(new Set([1, 2, 3]));

effect(() => {
  console.log(p.size);
})

p.add(4);
p.delete(4);