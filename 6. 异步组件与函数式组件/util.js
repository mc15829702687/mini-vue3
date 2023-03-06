import { ref } from "VueReactivity";

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
 * @param {*} loader
 */
function defineAsyncComponent(loader) {
  // 用来存储异步加载的组件
  let InnerComp = null;

  // 返回一个包装组件
  return {
    name: "AsyncComponentWrapper",
    setup() {
      // 异步组件是否加载成功
      const loaded = ref(false);
      // 执行加载器函数，返回一个 Promise 实例
      // 加载成功后，将加载成功的组件赋值给 InnerComp，并将 loaded 标记为 true，代表加载成功
      loader().then((c) => {
        InnerComp = c;
        loaded.value = true;
      });

      //如果异步组件加载成功，则渲染该组件，否则渲染一个占位内容
      return () =>
        loaded.value ? { type: InnerComp } : { type: Text, children: "" };
    },
  };
}
