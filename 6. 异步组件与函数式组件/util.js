import { ref, onUnMounted, shallowRef } from "VueReactivity";

/**
 * 最长递增子序列
 * @param {*} arr
 * @return 最长递增子序列下标
 */
function lis(arr) {}

// 任务缓存队列，用 Set 数据结构表示，这样可以自动对任务进行去重
const queue = new Set();
// 一个标志，代表是否正在刷新任务队列
let isFlushing = false;
// 一个 promise 实例
let p = Promise.resolve();

// 调度器的主要函数，用来将一个任务添加到缓冲队列中，并刷新任务队列
function queueJob(job) {
  queue.add(job);
  // 如果没有刷新任务队列，则刷新它
  if (!isFlushing) {
    // 将该标志设置为 true 避免重复刷新
    isFlushing = true;
    p.then(() => {
      try {
        // 执行微任务队列中的任务
        queue.forEach((job) => job());
      } finally {
        // 重置状态
        isFlushing = false;
        queue.clear();
      }
    });
  }
}

// resolveProps 函数解析 props 数据和 attrs 数据
function resolveProps(propsOption, propsData) {
  let props = {},
    attrs = {};
  // 遍历为组件传递的 props 数据
  for (let key in propsData) {
    // 以字符串 on 开头的 props，无论是否是显示声明，将其添加到 props 数据中
    if (key in propsOption || key.startsWith("on")) {
      // 如果为组件传递的 props 数据在组件自身的 props 选项中有定义，将其视为合法的 props
      props[key] = propsData[key];
    } else {
      // 否则将其作为 attrs 数据
      attrs[key] = propsData[key];
    }
  }

  return [props, attrs];
}

function hasPropsChanged(prevProps, nextProps) {
  const nextKeys = Object.keys(nextProps);
  // 如果新旧 props 数量变了，说明有变化
  if (nextKeys.length !== Object.keys(prevProps).length) {
    return true;
  }

  for (let k in nextProps) {
    // 有不相等的 props，说明有变化
    if (nextProps[key] !== prevProps[key]) {
      return true;
    }
  }
  return false;
}

// 注册生命周期
// 全局变量，存储当前正在被初始化的组件实例
let currentInstance = null;
function setCurrentInstance(instance) {
  currentInstance = instance;
}

/**
 * 高阶组件
 * 定义一个异步组件，接收一个异步组件加载器作为参数
 * @param {*} options
 */
function defineAsyncComponent(options) {
  // options 可以是配置项，也可以是加载器
  if (typeof options === "function") {
    // 如果 options 是加载器，将其格式化为 配置项对象
    options = {
      loader: options,
    };
  }

  const { loader } = options;

  // 用来存储异步加载的组件
  let InnerComp = null;

  // 记录重试次数
  let retries = 0;
  // 封装 load 函数用来加载异步组件
  function load() {
    return (
      loader()
        // 捕获加载器的错误
        .catch((err) => {
          // 如果用户指定了 onError 回调，则将控制权交给用户
          if (options.onError) {
            return new Promise((resolve, reject) => {
              // 重试
              const retry = () => {
                resolve(load());
                retries++;
              };
              // 失败
              const fail = () => reject(err);
              // 作为 onError 回调函数的参数，让用户决定下一步怎么做
              options.onError(retry, fail, retries);
            });
          } else {
            throw err;
          }
        })
    );
  }

  // 返回一个包装组件
  return {
    name: "AsyncComponentWrapper",
    setup() {
      // 异步组件是否加载成功
      const loaded = ref(false);
      // 代表是否超时
      // const timeout = ref(false);
      // 定义 error，当错误发生时，用来存储错误对象
      const error = shallowRef(null);
      // 代表是否正在加载
      const loading = ref(false);

      let loadingTimer = null;
      // 如果配置项中存在 delay，则开启一个定时器计时，当延迟到时后将 loading.value 设置为 true
      if (options.delay) {
        loadingTimer = setTimeout(() => {
          loading.value = true;
        }, options.delay);
      } else {
        // 如果配置项中没有 delay，则直接标记为加载中
        loading.value = true;
      }

      // 执行加载器函数，返回一个 Promise 实例
      // 加载成功后，将加载成功的组件赋值给 InnerComp，并将 loaded 标记为 true，代表加载成功
      load()
        .then((c) => {
          InnerComp = c;
          loaded.value = true;
        })
        // 添加 catch 语句捕获加载过程中的错误
        .catch((err) => (error.value = err))
        .finally(() => {
          loading.value = false;
          // 加载完毕后，无论成功与否都要清除延迟定时器
          clearTimeout(loadingTimer);
        });

      let timer = null;
      if (options.timeout) {
        // 如果指定了超时时长，则开启一个定时器计时
        timer = setTimeout(() => {
          // 超时后创建一个错误对象
          error.value = new Error(
            `Async Component timed out after ${options.timeout}ms`
          );
          // 超时后将 timeout 设置为 true
          // timeout.value = true;
        }, options.timeout);
      }
      // 包装组件被卸载时清除定时器
      onUnMounted(() => clearTimeout(timer));

      // 占位内容
      const placeholder = { type: Text, children: "" };

      return () => {
        if (loaded.value) {
          // 如果异步组件加载成功，则渲染该组件
          return { type: InnerComp };
        } else if (error.value && options.errorComponent) {
          // 只有当错误存在且用户配置了 errorComponent 时才展示 Error 组件，同时将 error 作为 props 传递
          return {
            type: options.errorComponent,
            props: {
              error: error.value,
            },
          };
        } else if (loading.value && options.loadingComponent) {
          // 如果异步组件正在加载，并且用户指定了 Loading 组件，则渲染 Loading 组件
          return {
            type: options.loadingComponent,
          };
        } else {
          return placeholder;
        }
      };
    },
  };
}
