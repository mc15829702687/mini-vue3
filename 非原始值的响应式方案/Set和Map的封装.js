// 在 createReactive 中封装代理 Set 和 Map 的逻辑
function createReactive(obj) {
  return new Proxy(obj, {
    get(target, key, receiver) {
      if (key === 'size') {
        return Reflect.get(target, key, target);
      }

      return target[key].bind(target);
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

const p = reactive(new Set([1, 2, 3]))
console.log(p.size);