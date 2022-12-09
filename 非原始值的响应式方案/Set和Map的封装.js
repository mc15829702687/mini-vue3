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
  },
  // Map 数据类型的 get 和 set 方法
  get(key) {
    // 获取原始值
    const target = this.raw;
    // 查看是否已经存在
    const had = target.has(key);
    // 依赖追踪
    track(target, key);
    if (had) {
      const res = target.get(key);
      return typeof res === 'object' ? reactive(res) : res;
    }
  },
  set(key, value) {
    const target = this.raw;
    const had = target.has(key);
    // 获取旧值
    const oldValue = target.get(key);
    // 假设 value 是响应式数据，通过 set 方法会把响应式数据设置到原始数据上，会造成原始数据污染
    // 所以 value 必须为 原始数据
    const rawValue = value.raw || value;
    // 设置新值
    target.set(key, rawValue);
    if (!had) {
      // 类型为添加
      trigger(target, key, 'ADD');
    } else if (value !== oldValue && (oldValue === oldValue && value === value)) {
      // 类型为修改
      trigger(target, key, 'SET');
    }
  },
  forEach(cb, thisArg) {
    // wrap 函数用来把可代理的值转为响应式数据
    const wrap = val => typeof val === 'object' ? reactive(val) : val;
    const target = this.raw;
    // 依赖追踪
    track(target, ITERATE_KEY);
    // 通过原始对象调用 forEach方法，并把 callback 传过去
    target.forEach((v, k) => {
      // 手动调用 callback 函数
      cb.call(thisArg, wrap(v), wrap(k), this);
    });
  },
  // 迭代器方法
  // 可迭代协议：一个对象是否实现了 Symbol.iterator 方法
  // 迭代器协议：一个对象实现了 next 方法
  [Symbol.iterator]: iterationMethod,
  entries: iterationMethod,
  values: valuesIterationMethod,
  keys: keysIterationMethod
}

function iterationMethod() {
  const target = this.raw;
  // 调用原始对象的迭代器方法
  const itr = target[Symbol.iterator]();

  // 封装一层，需求是 key 和 value 有可能是响应式数据
  const wrap = val => typeof val === 'object' && val !== null ? reactive(val) : val;

  // 调用 track 响应追踪
  track(target, ITERATE_KEY);

  // 返回自定义的迭代器
  return {
    next() {
      // 调用原始对象迭代器的 next 方法，得到 value 和 done
      const { value, done } = itr.next();
      return {
        value: value ? [wrap(value[0]), wrap(value[1])] : value,
        done
      }
    },
    // 实现可迭代协议
    [Symbol.iterator]() {
      return this;
    }
  }
}

function valuesIterationMethod() {
  const target = this.raw;
  const itr = target.values();

  const wrap = val => typeof val === 'object' && val !== null ? reactive(val) : val;

  // 调用 track 响应追踪
  track(target, ITERATE_KEY);

  return {
    next() {
      const { value, done } = itr.next();
      return {
        value: wrap(value),
        done
      }
    },
    [Symbol.iterator]() {
      return this;
    }
  }
}
const MAP_KEY_ITERATE_KEY = Symbol();
function keysIterationMethod() {
  const target = this.raw;
  const itr = target.keys();

  const wrap = val => typeof val === 'object' && val !== null ? reactive(val) : val;

  // 调用 track 响应追踪
  track(target, MAP_KEY_ITERATE_KEY);

  return {
    next() {
      const { value, done } = itr.next();
      return {
        value: wrap(value),
        done
      }
    },
    [Symbol.iterator]() {
      return this;
    }
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
  if (!activeEffect) return target[key];
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

  // 当操作类型 type 为 ADD 时，会取出与 ITERATE_KEY 相关联的副作用函数并执行
  if (
    type === 'ADD' ||
    type === 'DELETE' ||
    // 如果操作类型是 SET，并且目标对象是 Map 数据类型
    (type === 'SET' && Object.prototype.toString.call(target) === '[object Map]')
  ) {
    const iterateEffects = depsMap.get(ITERATE_KEY);
    iterateEffects && iterateEffects.forEach(effectFn => {
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn);
      }
    })
  }

  // 当操作类型 type 为 ADD 时，会取出与 MAP_KEY_ITERATE_KEY 相关联的副作用函数并执行
  if (
    type === 'ADD' || type === 'DELETE'
  ) {
    const iterateEffects = depsMap.get(MAP_KEY_ITERATE_KEY);
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
// const p = reactive(new Set([1, 2, 3]));

// effect(() => {
//   console.log(p.size);
// })

// p.add(4);
// p.delete(4);

// 3. 避免污染原始数据
// const p = reactive(new Map([['key', 1]]));

// effect(() => {
//   console.log(p.get('key'));
// })

// p.set('key', 5);

// 4. forEach 循环
// 4.1 值为非响应式数据
// const m = reactive(new Map([[{
//   key: 1
// }, {
//   value: 1
// }]]))
// effect(() => {
//   m.forEach((value, key) => {
//     console.log(value);
//     console.log(key);
//   })
// })
// m.set({ key: 2 }, { value: 2 })

// 4.2 值为响应式数据
// const key = { key: 1 };
// const value = new Set([1, 2, 3]);
// const p = reactive(new Map([[key, value]]));
// effect(() => {
//   p.forEach(function (value, key) {
//     console.log(value.size);
//   })
// })
// p.get(key).delete(1);

// 5. 迭代器方法
// const p = new Map([['key1', 'value1'], ['key2', 'value2']]);
// for (let [key, value] of p.entries()) {
//   console.log(key, value);
// }
// const itr = p[Symbol.iterator]();
// console.log(itr.next());
// console.log(itr.next());
// console.log(itr.next());
// console.log(p[Symbol.iterator] === p.entries);  // true

const p = reactive(new Map([['key1', 'value1'], ['key2', 'value2']]));
// effect(() => {
//   for (let [key, value] of p.entries()) {
//     console.log(key, value);
//   }
// })
// values 方法
// effect(() => {
//   for (let value of p.values()) {
//     console.log(value);
//   }
// })
// keys 方法
effect(() => {
  for (let key of p.keys()) {
    console.log(key);
  }
})
p.set('key2', 'value3');
p.set('key3', 'value3');