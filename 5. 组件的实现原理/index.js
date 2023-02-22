const { ref, effect, reactive } = VueReactivity;

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
   * 快速 Diff 算法
   * @param {*} n1 新节点
   * @param {*} n2 旧节点
   * @param {*} container 容器
   */
  function patchKeyedChildren(n1, n2, container) {
    const oldChildren = n2.children;
    const newChildren = n1.children;

    // 处理相同的前置节点
    // 索引指向新旧两组子节点的开头
    let j = 0;
    let oldVNode = oldChildren[j];
    let newVNode = newChildren[j];

    while (oldVNode.key === newVNode.key) {
      patch(oldVNode, newVNode, container);
      j++;
      oldVNode = oldChildren[j];
      newVNode = newChildren[j];
    }

    // 更新相同的后置节点
    let oldEnd = oldChildren.length - 1;
    let newEnd = newChildren.length - 1;

    newVNode = newChildren[newEnd];
    oldVNode = oldChildren[oldEnd];
    while (oldVNode.key === newVNode.key) {
      patch(oldVNode, newVNode, container);
      oldEnd--;
      newEnd--;
      oldVNode = oldChildren[oldEnd];
      newVNode = newChildren[newEnd];
    }

    // 预处理完毕后，如果满足如下条件，则说明 j --> newEnd 之间的节点应作为新节点插入
    if (j > oldEnd && j <= newEnd) {
      // 锚点的索引
      const anchorIndex = newEnd + 1;
      // 锚点元素
      const anchor =
        anchorIndex < newChildren.length ? newChildren[anchorIndex] : null;
      // 采用 while 循环，调用 patch 函数逐个挂载新增节点
      while (j <= newEnd) {
        patch(null, newChildren[j++], container, anchor);
      }
    } else if (j > newEnd && j <= oldEnd) {
      // j -> oldEnd 之间的节点应该被卸载
      while (j <= oldEnd) {
        unmount(oldChildren[j++]);
      }
    } else {
      // 处理非理想状况
      // 新的一组子节点中剩余未处理节点的数量
      const count = newEnd - j + 1;
      // 存放旧数组对应的索引值
      const source = new Array(count).fill(-1);

      // // 方法一：利用双重循环填充 source 数组，该算法的时间复杂度是 O(n^2)
      // oldStart 和 newStart 分别为起始索引，即 j
      const oldStart = j;
      const newStart = j;
      // // 遍历旧的一组子节点
      // for (let i = oldStart; i <= oldEnd; i++) {
      //   const oldVNode = oldChildren[i];
      //   for (let k = newStart; k <= newEnd; k++) {
      //     const newVNode = newChildren[k];
      //     // 找到拥有相同 key 值的可复用的节点
      //     if (oldVNode.key === newVNode.key) {
      //       // 调用 patch 进行更新
      //       patch(oldVNode, newVNode, container);
      //       // 最后填充 source 数组
      //       source[k - newStart] = i;
      //     }
      //   }
      // }

      // 方法二：构建一张索引表，用来存储节点 key 和 节点位置索引之间的映射，时间复杂度为 O(n)
      // 新增两个变量，moved 和 pos
      let moved = false;
      let pos = 0;

      // 构建索引表
      let keyInIdx = {};
      for (let i = newStart; i <= newEnd; i++) {
        keyInIdx[newChildren[i].key] = i;
      }

      // 代表更新过的节点数量
      let patched = 0;
      // 遍历旧的一组子节点中剩余未处理的节点
      for (let i = oldStart; i <= oldEnd; i++) {
        oldVNode = oldChildren[i];

        // 如果更新过的节点数量小于等于需要更新的节点数量，则执行更新
        if (patched <= count) {
          // 通过索引表快速找到新的一组子节点中具有相同 key 值的节点位置
          const k = keyInIdx[oldVNode.key];

          if (typeof k !== "undefined") {
            newVNode = newChildren[k];
            // 调用 patch 函数完成更新
            patch(oldVNode, newVNode, container);
            // 每更新一个节点，都将 patched 变量 +1
            patched++;
            // 填充 source 数组
            source[k - newStart] = k;

            // 判断节点是否需要移动
            if (k < pos) {
              moved = true;
            } else {
              pos = k;
            }
          } else {
            // 没找到直接卸载
            unmount(oldVNode);
          }
        } else {
          unmount(oldVNode);
        }
      }

      // moved 为 true，代表 DOM 需要移动
      if (moved) {
        // 计算最长递增子序列
        let seq = lis(source);

        // s 指向最长递增子序列的最后一个元素
        let s = seq.length - 1;
        // i 指向新的一组子节点中的最后一个元素
        let i = count - 1;
        for (; i >= 0; i--) {
          if (source[i] === -1) {
            // 说明索引为 i 的节点是全新节点，应该将其挂载
            // 该节点在新 children 中的真实位置索引
            const pos = newStart + i;
            const newVNode = newChildren[pos];

            // 该节点的下一个位置索引
            const nextPos = pos + 1;
            // 锚点
            const anchor =
              nextPos < newChildren.length ? newChildren[nextPos].el : null;
            // 挂载
            patch(null, newVNode, container, anchor);
          } else if (i !== seq[s]) {
            // 如果节点的索引 i 不等于 seq[s] 的值，说明该节点需要移动
            const pos = newStart + i;
            const newVNode = newChildren[pos];

            // 下一个位置索引
            const nextPos = pos + 1;
            // 锚点
            const anchor =
              nextPos < newChildren.length ? newChildren[nextPos].el : null;
            // 移动
            insert(newVNode.el, container, anchor);
          } else {
            // 当 i === seq[s] 时，说明该位置的节点不需要移动
            // 只需要让 s 指向下一个位置
            s--;
          }
        }
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
   * 挂载组件
   * @param {*} vnode 新节点
   * @param {*} container 容器
   * @param {*} anchor 锚点
   */
  function mountComponent(vnode, container, anchor) {
    // 通过 vnode 获取组件的选项对象，即 vnode.type
    const componentOptions = vnode.type;
    // 获取组件渲染函数
    const { render, data } = componentOptions;

    // 调用 data 函数获得原始数据，并调用 reactive 函数将其包装为响应式数据
    const state = reactive(data());

    // 当组件内部响应式数据发生变化时，组件自更新
    effect(
      () => {
        // 执行 render 函数时，将其 this 指向 state
        // 从而 render 函数内部可以通过 this 访问其响应式数据
        // 执行渲染函数，获取组件要渲染的内容，即 render 函数返回的虚拟 DOM
        const subTree = render.call(state, state);
        // 调用 patch 函数来挂载组件所描述的内容
        patch(null, subTree, container, anchor);
      },
      {
        // 指定该副作用函数的调度器为 queueJob
        scheduler: queueJob,
      }
    );
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
    } else if (typeof type === "object") {
      // vnode.type 是对象，作为组件来渲染
      if (!n1) {
        // 挂载组件
        mountComponent(n2, container, anchor);
      } else {
        // 更新组件
        patchComponent(n1, n2, anchor);
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

const MyComponent = {
  name: "my-component",
  // 用 data 函数来定义组件自身状态
  data() {
    return {
      foo: "hello world",
    };
  },
  render() {
    return {
      type: "div",
      children: `foo 的值是：${this.foo}`,
    };
  },
};
const CompVNode = {
  type: MyComponent,
};

renderer.render(CompVNode, document.querySelector("#app"));
