// const { ref, effect } = VueReactivity;

// const count = ref(1);
// function renderer(domString, container) {
//   container.innerHTML = domString;
// }

// effect(() => {
//   renderer(`<h1>${count.value}</h1>`, document.getElementById("app"));
// });

// count.value++;

// 判断是否通过 DOM Properties 方式设置（el[key] = value）
function shouldSetAsProps(el, key, value) {
  if (el.tagName === "INPUT" && key === "form") return false;
  return key in el;
}

// 将传入的 class 值转为 字符串
function normalizeClass(classVal) {
  let classArr = [];
  // 1. 数组
  if (isArray(classVal)) {
    classVal.forEach((className) => {
      classArr.push(normalizeClass(className));
    });
  }
  // 2. 对象
  else if (isPlainObject(classVal)) {
    for (let key in classVal) {
      if (!!classVal[key]) {
        classArr.push(key);
      }
    }
  }
  // 3. 字符串
  else if (isString(classVal)) {
    classArr.push(classVal);
  }
  return classArr.join(" ");
}

// 1. 渲染器的基本概念
// 1.1 渲染器：renderer
// 1.2 作用：把虚拟DOM渲染为特定平台上的真实元素
// 1.3 渲染器把虚拟DOM节点渲染为真实DOM节点的过程叫做挂载，也就是 mounted
function createRenderer(options) {
  // 通过 options 得到操作 DOM 的API，目的是渲染器函数变为'通用'，通过 options 配置项可以跨平台使用
  const { createElement, setTextContent, insert, patchProps } = options;
  // 挂载
  function mountElement(vnode, container) {
    // 创建 dom, 真实 dom 和 vnode 之间建立联系
    const el = (vnode.el = createElement(vnode.type));
    // children 为 字符串类型，代表元素具有文本节点
    if (typeof vnode.children === "string") {
      // 因此只需要设置元素的 textContent 属性即可
      setTextContent(el, vnode.children);
    } else if (Array.isArray(vnode.children)) {
      vnode.children.forEach((child) => {
        // 递归调用，渲染子元素
        patch(null, child, el);
      });
    }

    // 挂载属性
    if (vnode.props) {
      for (let key in vnode.props) {
        // 将属性的设置变得和平台无关，把属性设置相关操作也提取到渲染器选项中，调用 patchProps 函数即可
        patchProps(el, key, null, vnode.props[key]);
      }
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

  /**
   * 卸载操作
   * @param {*} vnode
   */
  function unmount(vnode) {
    // 根据 vnode 获取要卸载的真实 DOM
    const el = vnode.el;
    // 获取 el 的父元素
    const parent = el.parentNode;
    // 调用 removeChild 移除 el
    if (parent) parent.removeChild(el);
  }

  function render(vnode, container) {
    if (vnode) {
      // 新 vnode 存在，将其与旧 vnode 一起传递给 patch 函数，进行打补丁
      patch(container._vnode, vnode, container);
    } else {
      // 旧 vnode 存在，新 vnode 不存在，说明是 卸载(unmount) 操作
      if (container._vnode) {
        // 调用 unmount 卸载 vnode
        unmount(container._vnode);
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
  props: {
    id: "render",
    class: normalizeClass(["foo", { bar: true, baz: false }]),
  },
  children: [
    {
      type: "p",
      children: "Hello world!",
    },
    {
      type: "button",
      children: "按钮",
      props: {
        disabled: "",
      },
    },
  ],
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
  // 将属性设置相关操作封装到 patchProps 函数中，并作为渲染器选项传递
  patchProps(el, key, preValue, nextValue) {
    // 使用 shouldAsSetProps 判断是否按照 DOM Properties 方式设置
    if (shouldSetAsProps(el, key, nextValue)) {
      const type = typeof el[key];
      if (type === "boolean" && nextValue === "") {
        el[key] = true;
      } else {
        el[key] = nextValue;
      }
    } else {
      el.setAttribute(key, nextValue);
    }
  },
});
renderer.render(vnode, document.getElementById("app"));

// 3. 挂载元素子节点和属性

// 4. DOM Properties 和 HTML Attributes
// HTML Attributes 的作用是设置与之对应的 DOM Properties 的初始值
// DOM Properties 得到的是当前值，getAttribute 得到的是初始值
// const el = document.getElementById('my-input');
// el.addEventListener('change', () => {
//   console.log('my-input', el.getAttribute('value'));    // foo: 初始值
// })

// 5. 正确地设置元素属性
/**
 * setAttribute痛点：设置的值会转换为字符串，例如：false => 'false'
 * el[key] = value 痛点：空字符串会转为 false，例如：<button disabled>按钮</button>
 * 另外，只读属性，例如表单 DOM 上的 form 属性，需要通过 setAttribute 设置
 * 解决思路：
 *  1. 先在 DOM Properties 上找是否有存在的属性，并且不为只读属性
 *  2. 找到后，如果值的类型为 boolean，并且 新值为 ''，则设置新值为 true
 *  3. 否则，调用 setAtrribute 方法
 */

// 6. class 属性的设置
/**
 * Vue.js 中 class 属性的值有三种形式：
 *  1) 字符串，例如： 'foo bar'
 *  2) 对象，例如: {foo: true, bar: false}
 *  3) 数组，例如：['foo bar', {baz: true}]
 * 解决方法，序列化为字符串，即调用 normalizeClass 转为字符串
 */

// 7. 卸载操作
/**
 * 即 render(null, container)
 * 为什么不能使用 innerHTML = '' 来直接操作？
 * 1) 容器的内容可能是由一个或多个组件调用，应正确调用其 beforeUnmount、unmounted 等生命周期函数
 * 2) 有的元素存在自定义指令，应该在卸载时执行对应的指令钩子函数
 * 3) 不会移除绑定在 DOM 元素上的事件
 * 解决方法：使用 parentNode.removeChild，将 vnode 和真实 DOM 之间建立联系，即 vnode.el = dom
 */
