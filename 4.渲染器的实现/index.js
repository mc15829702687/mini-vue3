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
  const { createElement, setElementText, insert, patchProps } = options;
  // 挂载
  function mountElement(vnode, container) {
    // 创建 dom, 真实 dom 和 vnode 之间建立联系
    const el = (vnode.el = createElement(vnode.type));
    // children 为 字符串类型，代表元素具有文本节点
    if (typeof vnode.children === "string") {
      // 因此只需要设置元素的 textContent 属性即可
      setElementText(el, vnode.children);
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
  // 更新
  function patchElement(n1, n2) {
    const el = (n2.el = n1.el);
    const oldProps = n1.props;
    const newProps = n2.props;

    // 1. 更新 props
    for (const key in newProps) {
      if (newProps[key] !== oldProps[key]) {
        patchProps(el, key, oldProps[key], newProps[key]);
      }
    }
    for (const key in oldProps) {
      if (!key in newProps) {
        patchProps(el, key, oldProps[key], null);
      }
    }

    // 2. 更新子节点
    patchChildren(n1, n2, el);
  }

  /**
   * 更新子节点
   * @param {*} n1 旧节点
   * @param {*} n2 新节点
   * @param {*} container 正在打补丁的 DOM 元素
   */
  function patchChildren(n1, n2, container) {
    // 新节点为文本节点
    if (typeof n2.children === "string") {
      // 旧子节点有三种类型：没有子节点，文本节点，一组子节点
      // 只有一组子节点的情况才要逐个卸载
      if (isArray(n1.children)) {
        n1.children.forEach((c) => unmount(c));
      }
      // 最后将文本节点的内容设置给容器
      setElementText(container, n2.children);
    } else if (isArray(n2.children)) {
      // 新节点为一组子节点
      // 旧节点也为一组子节点
      if (isArray(n1.children)) {
        // diff 算法去更新
        n1.children.forEach((c) => unmount(c));
        n2.children.forEach((c) => patch(null, c, container));
      } else {
        // 旧节点为文本节点，或者没有子节点
        // 将容器清空，再将子节点逐个挂载
        setElementText(container, "");
        n2.children.forEach((c) => patch(null, c, container));
      }
    } else {
      // 新子节点不存在
      // 旧子节点是一组子节点，逐个卸载
      if (isArray(n1.children)) {
        n1.children.forEach((c) => unmount(c));
      } else if (isString(n1.children)) {
        // 旧子节点是文本节点，直接清空
        setElementText(container, "");
      }
      // 如果也没有旧子节点，什么也不做
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

  /**
   * 打补丁操作，当 n1 为 undefined时，说明是首次渲染
   * @param {*} n1 旧 vnode
   * @param {*} n2 新 vnode
   * @param {*} container 渲染容器
   */
  function patch(n1, n2, container) {
    if (n1 && n1.type !== n2.type) {
      unmount(n1);
      n1 = null;
    }

    // 代码运行到这，说明 n1 和 n2 所描述的内容相同
    const { type } = n2;

    // 如果 type 为字符串 则说明描述的普通标签元素
    if (typeof type === "string") {
      // 如果 n1 不存在意味着挂载，则调用 mountElement 函数进行挂载
      if (!n1) {
        mountElement(n2, container);
      } else {
        // n1 存在，意味着打补丁，暂时省略
        patchElement(n1, n2);
      }
    } else if (typeof type === "object") {
      // 描述的是组件
    } else {
      // 处理其他类型的 vnode
    }
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
const renderer = createRenderer({
  // 用于创建元素
  createElement(tag) {
    return document.createElement(tag);
  },
  // 用于设置元素的文本节点
  setElementText(el, text) {
    el.textContent = text;
  },
  // 用于在给定的 parent 下添加指定元素
  insert(el, parent, anchor = null) {
    parent.insertBefore(el, anchor);
  },
  // 将属性设置相关操作封装到 patchProps 函数中，并作为渲染器选项传递
  patchProps(el, key, preValue, nextValue) {
    // 处理事件，以 on 开头的属性
    if (/^on/.test(key)) {
      // 获取伪造事件函数
      const invokers = el._vei || (el._vei = {});
      let invoker = invokers[key];
      // 获取事件名称
      const name = key.slice(2).toLowerCase();

      if (nextValue) {
        if (!invoker) {
          // 如果没有 invoker，则将一个伪造的 invoker 缓存到 el._vei
          // vei 是 vue event invoker 的首字母缩写
          invoker = el._vei[key] = (e) => {
            // e.timeStamp 事件发生时间
            // 如果事件发生时间早于事件处理函数的绑定时间，则不执行处理函数
            if (e.timeStamp < invoker.attached) return;
            // 如果 invoke.value 是数组的话，则遍历它并逐个调用事件处理函数
            if (isArray(invoker.value)) {
              invoker.value.forEach((fn) => fn(e));
            } else {
              // 当伪造的事件处理函数执行时，会执行真正的事件处理函数
              invoker.value(e);
            }
          };
          // 将真正的事件处理函数赋值给 invoker.value
          invoker.value = nextValue;
          // 添加 invoker.attached 属性，存储事件处理函数绑定的时间
          invoker.attached = performance.now();
          // 绑定 invoker 作为事件处理函数
          el.addEventListener(name, invoker);
        } else {
          // 如果 invoker 存在，说明是更新操作，直接改变 invoker.value 的值即可
          invoker.value = nextValue;
        }
      } else if (invoker) {
        // 新的事件绑定函数不存在，且之前的绑定函数存在，则移除之前事件函数
        el.removeEventListener(name, invoker);
      }

      // // 移除上次绑定事件的函数
      // preValue && el.removeEventListener(name, preValue);
      // // 绑定事件, nextValue 为事件处理函数
      // el.addEventListener(name, nextValue);
    } else if (key === "class") {
      // className 性能优于, classList 和 setAttribute
      el.className = nextValue || "";
    }
    // 使用 shouldAsSetProps 判断是否按照 DOM Properties 方式设置
    else if (shouldSetAsProps(el, key, nextValue)) {
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
        disabled: false,
        onClick: [
          (e) => {
            alert("click1");
          },
          (e) => {
            alert("click2");
          },
        ],
        onContextmenu(e) {
          alert("contextmenu");
        },
      },
    },
  ],
};
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

// 8. 区分 vnode 的类型
/**
 * 更新操作时，要确保 oldVnode.type 和 newVnode.type 一致
 * type 区分类型: string 为真实元素，object 为组件等
 */

// 9. 事件的处理
/**
 * 1. 在 vnode.props 中，以 on 开头的属性视为事件
 * 2. patchProps 中，通过截取 on后面事件名，监听事件
 * 3. 性能优化，每次更新前都要移除上次事件函数，伪造一个事件处理函数 invoker
 */

// 10. 事件冒泡与更新时机问题
/**
 * 例子如下，事件会冒泡
 * 原因：因为 bol 变量是响应式的，当值改变会触发 副作用函数执行，更新 DOM，添加父节点点击事件
 * 解决方法：屏蔽所有绑定时间晚于事件触发时间的事件处理函数的执行
 */
// const bol = ref(false);

// effect(() => {
//   const vnode = {
//     type: "div",
//     props: bol.value
//       ? {
//           onClick: (e) => {
//             console.log("div click");
//           },
//         }
//       : {},
//     children: [
//       {
//         type: "p",
//         props: {
//           onClick: () => {
//             bol.value = true;
//             console.log("p click");
//           },
//         },
//         children: "text",
//       },
//     ],
//   };
//   renderer.render(vnode, document.getElementById("app"));
// });

// 11. 更新子节点
/**
 *  1) 子节点有三种情况
 *    * 没有子节点，children 为 null,
 *    * 子节点为文本节点，children 为字符串
 *    * 其他情况，无论是单个子节点，还是多个子节点都可用数组表示
 */
