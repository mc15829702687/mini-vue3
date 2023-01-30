const { ref, effect } = VueReactivity;

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
  const {
    createElement,
    setElementText,
    insert,
    patchProps,
    createText,
    setText,
  } = options;
  // 挂载
  function mountElement(vnode, container, anchor) {
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

    // 在插入节点时，将锚点元素透传给 insert 函数
    insert(el, container, anchor);
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
      if (!(key in newProps)) {
        patchProps(el, key, oldProps[key], null);
      }
    }

    // 2. 更新子节点
    patchChildren(n1, n2, el);
  }

  /**
   * 双端 diff 算法
   * @param {*} n1 新节点
   * @param {*} n2 旧节点
   * @param {*} container 容器
   */
  function patchKeyedChildren(n1, n2, container) {
    const oldChildren = n2.children;
    const newChildren = n1.children;

    // 四个索引值
    let oldStartIdx = 0;
    let oldEndIdx = oldChildren.length - 1;
    let newStartIdx = 0;
    let newEndIdx = newChildren.length - 1;

    // 四个索引值指向的 VNode 节点
    let oldStartVNode = oldChildren[oldStartIdx];
    let oldEndVNode = oldChildren[oldEndIdx];
    let newStartVNode = newChildren[newStartIdx];
    let newEndVNode = newChildren[newEndIdx];

    // 双端比较
    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      // 增加两个判断分支，如果头尾部节点为 undefined，则说明该节点已经被处理过了，直接跳到下一个位置
      if (!oldStartVNode) {
        oldStartVNode = oldChildren[++oldStartIdx];
      } else if (!oldEndVNode) {
        oldEndVNode = oldChildren[--oldEndIdx];
      } else if (oldStartVNode.key === newStartVNode.key) {
        // 第一步：oldStartVNode 与 newStartVNode 比较
        patch(oldStartVNode, newStartVNode, container);

        // 更新相关索引到下一个位置
        oldStartVNode = oldChildren[++oldStartIdx];
        newStartVNode = newChildren[++newStartIdx];
      } else if (oldEndVNode.key === newEndVNode.key) {
        // 第二步：oldEndVNode 与 newEndVNode 比较
        // 节点在新的顺序中仍然处于尾部，不需要移动，但仍需打补丁
        patch(oldEndVNode, newEndVNode, container);

        // 更新索引和头尾部节点变量
        oldEndVNode = oldChildren[--oldEndIdx];
        newEndVNode = newChildren[--newEndIdx];
      } else if (oldStartVNode.key === newEndVNode.key) {
        // 第三步：oldStartVNode 与 newEndVNode 比较
        patch(oldStartVNode, newEndVNode, container);

        // 将旧的一组子节点的头部节点对应的真实 DOM 节点 oldStartVNode.el 移动到
        // 旧的一组子节点的尾部节点对应的真实 DOM 节点后面
        insert(oldStartVNode.el, container, oldEndVNode.el.nextSibling);
        // 更新相关索引到下一个位置
        oldEndVNode = oldChildren[++oldStartIdx];
        newEndVNode = newChildren[--newEndIdx];
      } else if (oldEndVNode.key === newStartVNode.key) {
        // 第四部：oldEndVNode 与 newSTartVNode 比较
        // 仍然需要 patch 函数打补丁操作
        patch(oldEndVNode, newStartVNode, container);

        // 移动 DOM 操作
        // 将 oldEndVNode.el 移动到 oldStartVNode.el 前面
        insert(oldEndVNode.el, container, oldStartVNode.el);

        // 移动 DOM 完成后，更新索引值，并指向下一个位置
        oldEndVNode = oldChildren[--oldEndIdx];
        newStartVNode = newChildren[++newStartIdx];
      } else {
        // 遍历旧 children 试图寻找与 newStartVNode 拥有相同 key 值的元素
        const idxInold = newChildren.findIndex(
          (node) => node.key === newStartVNode.key
        );

        // idxInold 大于 0，说明找到可复用的节点，并且需要将其对应的真实 DOM 移动到头部
        if (idxInold > 0) {
          // idxInOld 位置对应的 vnode 就是需要移动的节点
          const vnodeToMove = oldChildren[idxInold];
          // 打补丁
          patch(vnodeToMove, newStartVNode, container);
          // 将 vnodeToMove.el 移动到头部节点 oldStartVNode.el 之前，因此使用厚着作为锚点
          insert(vnodeToMove.el, container, oldStartVNode.el);
          // 由于位置 indexInOld 处的节点所对应的真实 DOM 已经移动到别处，因此将其设置为 undefined
          oldChildren[idxInold] = undefined;
        } else {
          // 将 newStartVNode 作为节点挂载到头部，使用当前头部节点 oldStartVNode
          patch(null, newStartVNode, container, oldStartVNode.el);
        }

        // 最后更新 newStartIdx 到下一处位置
        newStartVNode = newChildren[++newStartIdx];
      }
    }

    // 循环结束后检查索引值的情况
    if (oldStartIdx > oldEndIdx && newStartIdx <= newEndIdx) {
      // 如果满足条件，说明有新的节点遗留，需要挂载它们
      for (let i = newStartIdx; i <= newEndIdx; i++) {
        patch(null, newChildren[i], container, oldStartVNode.el);
      }
    } else if (newStartIdx > newEndIdx && oldStartIdx <= oldEndIdx) {
      // 移除操作
      for (let i = oldStartIdx; i <= oldEndIdx; i++) {
        unmount(oldChildren[i]);
      }
    }
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
      // 封装 patchKeyedChildren 函数处理两组子节点
      patchKeyedChildren(n1, n2, container);
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
    // 在卸载时，如果卸载的 vnode 类型为 Fragment，则需要卸载其 children
    if (vnode.type === Fragment) {
      vnode.children.forEach((c) => unmount(c));
      return;
    }

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
   * @param {*} anchor 锚点
   */
  function patch(n1, n2, container, anchor) {
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
        mountElement(n2, container, anchor);
      } else {
        // n1 存在，意味着打补丁
        patchElement(n1, n2);
      }
    } else if (typeof type === "object") {
      // 描述的是组件
    } else if (type === Text) {
      // 文本节点
      // 没有旧节点，说明是挂载
      if (!n1) {
        // 使用 createText 创建文本节点
        createText(n2.children);
        // 将文本节点插入到容器中
        insert(el, container);
      } else {
        // 如果旧 vnode 存在，只需要使用新文本节点来更新旧文本节点即可
        const el = (n2.el = n1.el);
        if (n1.children !== n2.children) {
          // 调用 setText 函数更新文本内容
          setText(el, n2.children);
        }
      }
    } else if (type === Fragment) {
      // 片段
      if (!n1) {
        // 如果旧 vnode 不存在，则只需要将 Fragment 的 children 逐个挂载即可
        n2.children.forEach((c) => patch(null, c, container));
      } else {
        // 如果旧 vnode 存在，则只需要更新 Fragment 的 children 即可
        patchChildren(n1, n2, container);
      }
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
  // 创建文本节点
  createText(text) {
    return document.createTextNode(text);
  },
  // 修改文本内容
  setText(el, text) {
    el.nodeValue = text;
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
        el[key] = nextValue || "";
      }
    } else {
      el.setAttribute(key, nextValue);
    }
  },
});
