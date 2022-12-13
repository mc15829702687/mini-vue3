// const { ref, effect } = VueReactivity;

// const count = ref(1);
// function renderer(domString, container) {
//   container.innerHTML = domString;
// }

// effect(() => {
//   renderer(`<h1>${count.value}</h1>`, document.getElementById("app"));
// });

// count.value++;

// 1. 渲染器的基本概念
// 1.1 渲染器：renderer
// 1.2 作用：把虚拟DOM渲染为特定平台上的真实元素
// 1.3 渲染器把虚拟DOM节点渲染为真实DOM节点的过程叫做挂载，也就是 mounted
function createRenderer(options) {
  // 通过 options 得到操作 DOM 的API，目的是渲染器函数变为'通用'，通过 options 配置项可以跨平台使用
  const { createElement, setTextContent, insert } = options;
  // 挂载
  function mountElement(vnode, container) {
    // 创建 dom
    const el = createElement(vnode.type);
    // children 为 字符串类型，代表元素具有文本节点
    if (typeof vnode.children === "string") {
      // 因此只需要设置元素的 textContent 属性即可
      setTextContent(el, vnode.children);
    }
    // 将元素添加到容器中
    insert(el, container);
  }
  /**
   * 打补丁操作，当 n1 为 undefined时，说明是首次渲染
   * @param {*} n1 旧 vnode
   * @param {*} n2 新 vnode
   * @param {*} container 渲染容器
   */
  function patch(n1, n2, container) {
    // 如果 n1 不存在意味着挂载，则调用 mountElement 函数进行挂载
    if (!n1) {
      mountElement(n2, container);
    } else {
      // n1 存在，意味着打补丁，暂时省略
    }
  }

  function render(vnode, container) {
    if (vnode) {
      // 新 vnode 存在，将其与旧 vnode 一起传递给 patch 函数，进行打补丁
      patch(container._vnode, vnode, container);
    } else {
      if (container._vnode) {
        // 旧 vnode 存在，新 vnode 不存在，说明是 卸载(unmount) 操作
        container.innerHTML = "";
      }
    }

    // 把 vnode 存储到 contianer._vnode 下，即后续渲染中的旧 vnode
    container._vnode = vnode;
  }
  return {
    render,
  };
}

// 2. 自定义渲染器
const vnode = {
  type: "h1",
  children: "hello",
};
const renderer = createRenderer({
  // 用于创建元素
  createElement(tag) {
    return document.createElement(tag);
  },
  // 用于设置元素的文本节点
  setTextContent(el, text) {
    el.textContent = text;
  },
  // 用于在给定的 parent 下添加指定元素
  insert(el, parent, anchor = null) {
    parent.insertBefore(el, anchor);
  },
});
renderer.render(vnode, document.getElementById("app"));
