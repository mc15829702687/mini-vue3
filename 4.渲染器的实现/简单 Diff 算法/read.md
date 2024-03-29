## 一、渲染器的设置

### 1. 渲染器的基本概念

1. 渲染器：renderer
2. 作用：把虚拟 DOM 渲染为特定平台上的真实元素
3. 渲染器把虚拟 DOM 节点渲染为真实 DOM 节点的过程叫做挂载，也就是 mounted

### 2. 自定义渲染器

在浏览器平台上，渲染器可以利用 DOM API 完成 DOM 元素的创建、修改和删除。
为了让渲染器不直接依赖浏览器平台特有的 API，我们将这些用来创建、修改和删除元素的操作抽象成可配置的对象。
用户可以在 调用 createRenderer 函数创建渲染器的时候指定已定义的配置对象，从而实现自定义行为

## 二、挂载与更新

### 1. 挂载子节点和元素的属性

### 2. DOM Properties 和 HTML Attributes

1.  HTML Attributes 的作用是设置与之对应的 DOM Properties 的初始值
2.  DOM Properties 得到的是当前值，`getAttribute` 得到的是初始值

         const el = document.getElementById('my-input');
         el.addEventListener('change', () => {
           console.log('my-input', el.getAttribute('value'));    // foo: 初始值
         })

### 3. 正确地设置元素属性

`setAttribute` 痛点：设置的值会转换为字符串，例如：false => 'false'
`el[key] = value` 痛点：空字符串会转为 false，例如：`<button disabled>按钮</button>`
另外，只读属性，例如表单 DOM 上的 form 属性，需要通过 setAttribute 设置
解决思路：

1.  先在 DOM Properties 上找是否有存在的属性，并且不为只读属性
2.  找到后，如果值的类型为 boolean，并且 新值为 ''，则设置新值为 true
3.  否则，调用 `setAtrribute` 方法

### 4. class 属性的设置

Vue.js 中 class 属性的值有三种形式：

1.  字符串，例如： `'foo bar'`
2.  对象，例如: `{foo: true, bar: false}`
3.  数组，例如：`['foo bar', {baz: true}]`

解决方法：序列化为字符串，即调用 `normalizeClass`函数转为字符串
性能：className > classList > setAttribute

### 5. 卸载操作

即 `render(null, container)`
为什么不能使用 `innerHTML = ''` 来直接操作？

1. 容器的内容可能是由一个或多个组件调用，应正确调用其 beforeUnmount、unmounted 等生命周期函数
2. 有的元素存在自定义指令，应该在卸载时执行对应的指令钩子函数
3. 不会移除绑定在 DOM 元素上的事件
   解决方法：使用 `parentNode.removeChild`，将 vnode 和真实 DOM 之间建立联系，即 `vnode.el = dom`

### 6. 区分 vnode 的类型

更新操作时，要确保 oldVnode.type 和 newVnode.type 一致。
type 区分类型: string 为真实元素，object 为组件等。

### 7. 事件的处理

1.  在 vnode.props 中，以 on 开头的属性视为事件；
2.  patchProps 中，通过截取 on 后面事件名，监听事件；
3.  性能优化，每次更新前都要移除上次事件函数，伪造一个事件处理函数 invoker。

### 8. 事件冒泡与更新时机问题

例子如下，事件会冒泡
原因：因为 bol 变量是响应式的，当值改变会触发 副作用函数执行，更新 DOM，添加父节点点击事件
解决方法：屏蔽所有绑定时间晚于事件触发时间的事件处理函数的执行

    const bol = ref(false);
    effect(() => {
      const vnode = {
        type: "div",
        props: bol.value ? {
           onClick: (e) => {
             console.log("div click");
           },
         }: {},
        children: [
          {
            type: "p",
            props: {
              onClick: () => {
                bol.value = true;
                console.log("p click");
              },
            },
            children: "text",
          },
        ]};
      renderer.render(vnode, document.getElementById("app"));
    });

### 9. 更新子节点

子节点有三种情况

- 没有子节点，children 为 null；
- 子节点为文本节点，children 为字符串；
- 其他情况，无论是单个子节点，还是多个子节点都可用数组表示。

```
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
        // 1. deprecated：先卸载，再挂载(太耗性能)
        // n1.children.forEach((c) => unmount(c));
        // n2.children.forEach((c) => patch(null, c, container));

        // 2. 调用 patch 方法，
        //  1) 公用长度调用 patch 更新
        //  2) newLen > oldLen, 超出部分挂载
        //  3) newLen < oldLen，oleLen 超出部分卸载
        const oldChildren = n1.children;
        const newChildren = n2.children;
        // 旧的一组子节点长度
        const oldLen = oldChildren.length;
        // 新的一组子节点长度
        const newLen = newChildren.length;
        // 两组子节点的公共长度，即两组中较短的一组的长度
        const commonLen = Math.min(oldLen, newLen);

        // // 遍历 commonLen 次
        // for (let i = 0; i < commonLen; i++) {
        //   patch(oldChildren[i], newChildren[i], container);
        // }

        // // 如果新子节点长度大于旧子节点长度，说明有新子节点要挂载
        // if (newLen > oldLen) {
        //   for (let i = commonLen; i < newLen; i++) {
        //     patch(null, newChildren[i], container);
        //   }
        // } else {
        //   // 如果旧子节点长度大于新子节点长度，说明有旧子节点要卸载
        //   for (let i = commonLen; i < oldLen; i++) {
        //     unmount(oldChildren[i]);
        //   }
        // }

        // 3. Diff 算法
        // 用来存储在寻找过程中遇到的最大索引值
        let lastIndex = 0;
        // 遍历新的 children
        for (let i = 0; i < newLen; i++) {
          const newVNode = newChildren[i];
          // 新增节点标识
          let find = false;
          // 遍历旧的 children
          for (let j = 0; j < oldLen; j++) {
            const oldVNode = oldChildren[j];
            // 如果找到形同的 key 值的两个节点，说明可以复用，但仍需调用 patch 函数更新
            if (newVNode.key === oldVNode.key) {
              // 一旦找到可复用的节点，则将变量 find 的值设为 true
              find = true;
              patch(oldVNode, newVNode, container);

              if (j < lastIndex) {
                // 如果当前节点在旧 children 中的索引小于最大索引值 lastIndex
                // 说明该节点对应的真实 DOM 需要移动
                // 先获取 newVNode 的前一个 vnode，即 prevNode
                const prevNode = newChildren[i - 1];
                // 如果 prevNode 不存在，则说明当前 newVNode 是第一个节点，他不需要移动
                if (prevNode) {
                  // 由于我们要将 newVNode 对应的真实 DOM 移动到 prevNode 所对应真实 DOM 后面，
                  // 所以我们需要获取 prevNode 所对应真实 DOM 的下一个兄弟节点，并将其作为锚点
                  const anchor = prevNode.el.nextSibling;
                  // 调用 insert 方法将 newVNode 对应的真实 DOM 插入到锚点元素前面
                  // 也就是 prevNode 对应的真实 DOM 的后面
                  insert(newVNode.el, container, anchor);
                }
              } else {
                // 如果当前找到的节点在旧 children 中的索引大于最大索引值，
                // 则更新 lastIndex 的值
                lastIndex = j;
              }

              break;
            }
          }
          // 如果代码运行到这里，find 仍然为 false
          // 说明当前 newVNode 没有在旧的一组子节点中找到可复用的节点
          // 也就是说，当前 newVNode 是新增节点，需要挂载
          if (!find) {
            // 为了将节点挂载到正确位置，我们需要先获取锚点元素
            // 首先获取当前 newVNode 的前一个 vnode 节点
            const prevNode = newChildren[i - 1];
            let anchor = null;
            if (prevNode) {
              // 如果有前一个 vnode 节点，则使用它的下一个兄弟节点作为锚点元素
              anchor = prevNode.el.nextSibling;
            } else {
              // 如果没有前一个 vnode 节点，说明即将挂载的新节点是第一个子节点
              // 这时我们使用容器元素的第一个 firstChild 作为锚点
              anchor = container.fistChild;
            }

            // 挂载 newVNode
            // 注意：为什么不使用 insert 直接插入，因为 insert 函数第一个参数是 el
            // 新增 vnode 还没创建 el，所以这里使用 patch 函数
            patch(null, newVNode, container, anchor);
          }
        }

        // 上一步的更新操作完成后
        // 遍历旧的一组子节点
        for (let i = 0; i < oldLen; i++) {
          const oldVNode = oldChildren[i];
          // 拿旧子节点 oldVNode 去新的一组子节点中寻找具有相同 key 值的节点
          const has = newChildren.find((c) => c.key === oldVNode.key);
          if (!has) {
            // 如果没有找到具有相同 key 值的节点，则说明需要删除该节点
            // 调用 unmount 函数将其卸载
            unmount(oldVNode);
          }
        }
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
```

### 10. 文本节点和注释节点

文本节点和注释节点的 children 都是字符串，只能分别定义 type(Symbol) 来区别
文本节点：

1.  判断 type === Text； (注：`Text === Symbol()`)
2.  旧文本节点不存在，使用 createTextNode 创建节点，并插入容器；
3.  旧文本节点存在，直接更新旧文本节点内容即可。

```
if (type === Text) {
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
}
```

### 11. 文本节点和注释节点

类似于组件拥有多个根节点:

```
<template>
  <li>1</li>
  <li>2</li>
  <li>3</li>
</template>
vnode:
{
  type: Fragment,
  children: [
    {type: 'li', children: 'item1'},
    {type: 'li', children: 'item2'},
    {type: 'li', children: 'item3'}
  ]
}
```

```
if (type === Fragment) {
  // 片段
  if (!n1) {
    // 如果旧 vnode 不存在，则只需要将 Fragment 的 children 逐个挂载即可
    n2.children.forEach((c) => patch(null, c, container));
  } else {
    // 如果旧 vnode 存在，则只需要更新 Fragment 的 children 即可
    patchChildren(n1, n2, container);
  }
}
```

## 二、简单 Diff 算法

### 1. 减少 DOM 操作的性能开销

假设：有新旧两组数据，如下所示，更新时，按着以前先全部卸载，再重新挂载，需要 6 次操作 DOM，而递归调用 patch 方法只需要三次，判断新旧长度相等、新大于旧、旧大于新三种情况。

```
oldVnode: {                                   newVnode: {
 type: 'div',                                  type: 'div',
 children: [                                   children: [
   {type: 'p', children: '1'},                   {type: 'p', children: '4'},
   {type: 'p', children: '2'},                   {type: 'p', children: '5'},
   {type: 'p', children: '3'},                   {type: 'p', children: '6'},
 ]                                             ]
}                                             }
```

### 2. DOM 复用和 key 的作用

假设：有新旧两组数据，如下所示，更新时，按着以前 patch 比较，type 不相等直接卸载再挂载，需 6 次 DOM 操作，而只改变其 text 后，再移动只需 3 次，如果只比较 type 值，无法判断，所以 key 的作用出现了，key 属性就像虚拟节点的 “身份证”号，只要两个虚拟节点的 type 和 key 相同，则认为两个虚拟节点是相同的。

```
 oldVnode: {                                   newVnode: {
  type: 'div',                                  type: 'div',
  children: [                                   children: [
    {type: 'p', children: '1', key: 1},                   {type: 'p', children: '3', key: 3},
    {type: 'p', children: '2', key: 2},                   {type: 'p', children: '1', key: 1},
    {type: 'p', children: '3', key: 3},                   {type: 'p', children: '2', key: 2},
  ]                                             ]
 }                                             }
```

### 3. DOM 复用和 key 的作用

在旧 children 中寻找具有相同 key 值节点的过程中，遇到的最大索引值
如果在后续寻找的过程中，存在索引值比当前遇到的最大索引值还要小的节点，
则意味着该节点需要移动。

### 4. 移动元素

如果条件 `j<lastIndex` 成立，则说明当前 newVNode 所对应的真实 DOM 需要移动。

### 5. 添加新元素

1.  找到新增节点，定义变量 find，默认值为 false，在旧 children 中找到，find = true；
2.  find === false，意味着该节点为新增节点，改变其位置即可；
3.  找到前一个 vnode，插入其后，没有找到前一个 vnode 说明是第一个，插入第一个位置即可。

### 6. 移除不存在元素

在上一步更新操作完成后，还需遍历旧的一组子节点。
目的是检查旧子节点在新的一组子节点中是否仍然存在，如果已经不存在了，则调用 `unmount` 函数将其卸载。

### 7.总结

简单 Diff 算法：

1. 拿新的一组字节点中的节点去旧的一组子节点中去寻找可复用的节点；
2. 如果找到了，则记录该节点的位置索引，我们把这个位置索引称为最大索引；
3. 在整个更新过程中，如果一个节点的索引值小于最大索引，则说明该节点对应的真实 DOM 元素需要移动。

完整代码如下：

```
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
        // 1. deprecated：先卸载，再挂载(太耗性能)
        // n1.children.forEach((c) => unmount(c));
        // n2.children.forEach((c) => patch(null, c, container));

        // 2. 调用 patch 方法，
        //  1) 公用长度调用 patch 更新
        //  2) newLen > oldLen, 超出部分挂载
        //  3) newLen < oldLen，oleLen 超出部分卸载
        const oldChildren = n1.children;
        const newChildren = n2.children;
        // 旧的一组子节点长度
        const oldLen = oldChildren.length;
        // 新的一组子节点长度
        const newLen = newChildren.length;
        // 两组子节点的公共长度，即两组中较短的一组的长度
        const commonLen = Math.min(oldLen, newLen);

        // // 遍历 commonLen 次
        // for (let i = 0; i < commonLen; i++) {
        //   patch(oldChildren[i], newChildren[i], container);
        // }

        // // 如果新子节点长度大于旧子节点长度，说明有新子节点要挂载
        // if (newLen > oldLen) {
        //   for (let i = commonLen; i < newLen; i++) {
        //     patch(null, newChildren[i], container);
        //   }
        // } else {
        //   // 如果旧子节点长度大于新子节点长度，说明有旧子节点要卸载
        //   for (let i = commonLen; i < oldLen; i++) {
        //     unmount(oldChildren[i]);
        //   }
        // }

        // 3. Diff 算法
        // 用来存储在寻找过程中遇到的最大索引值
        let lastIndex = 0;
        // 遍历新的 children
        for (let i = 0; i < newLen; i++) {
          const newVNode = newChildren[i];
          // 新增节点标识
          let find = false;
          // 遍历旧的 children
          for (let j = 0; j < oldLen; j++) {
            const oldVNode = oldChildren[j];
            // 如果找到形同的 key 值的两个节点，说明可以复用，但仍需调用 patch 函数更新
            if (newVNode.key === oldVNode.key) {
              // 一旦找到可复用的节点，则将变量 find 的值设为 true
              find = true;
              patch(oldVNode, newVNode, container);

              if (j < lastIndex) {
                // 如果当前节点在旧 children 中的索引小于最大索引值 lastIndex
                // 说明该节点对应的真实 DOM 需要移动
                // 先获取 newVNode 的前一个 vnode，即 prevNode
                const prevNode = newChildren[i - 1];
                // 如果 prevNode 不存在，则说明当前 newVNode 是第一个节点，他不需要移动
                if (prevNode) {
                  // 由于我们要将 newVNode 对应的真实 DOM 移动到 prevNode 所对应真实 DOM 后面，
                  // 所以我们需要获取 prevNode 所对应真实 DOM 的下一个兄弟节点，并将其作为锚点
                  const anchor = prevNode.el.nextSibling;
                  // 调用 insert 方法将 newVNode 对应的真实 DOM 插入到锚点元素前面
                  // 也就是 prevNode 对应的真实 DOM 的后面
                  insert(newVNode.el, container, anchor);
                }
              } else {
                // 如果当前找到的节点在旧 children 中的索引大于最大索引值，
                // 则更新 lastIndex 的值
                lastIndex = j;
              }

              break;
            }
          }
          // 如果代码运行到这里，find 仍然为 false
          // 说明当前 newVNode 没有在旧的一组子节点中找到可复用的节点
          // 也就是说，当前 newVNode 是新增节点，需要挂载
          if (!find) {
            // 为了将节点挂载到正确位置，我们需要先获取锚点元素
            // 首先获取当前 newVNode 的前一个 vnode 节点
            const prevNode = newChildren[i - 1];
            let anchor = null;
            if (prevNode) {
              // 如果有前一个 vnode 节点，则使用它的下一个兄弟节点作为锚点元素
              anchor = prevNode.el.nextSibling;
            } else {
              // 如果没有前一个 vnode 节点，说明即将挂载的新节点是第一个子节点
              // 这时我们使用容器元素的第一个 firstChild 作为锚点
              anchor = container.fistChild;
            }

            // 挂载 newVNode
            // 注意：为什么不使用 insert 直接插入，因为 insert 函数第一个参数是 el
            // 新增 vnode 还没创建 el，所以这里使用 patch 函数
            patch(null, newVNode, container, anchor);
          }
        }

        // 上一步的更新操作完成后
        // 遍历旧的一组子节点
        for (let i = 0; i < oldLen; i++) {
          const oldVNode = oldChildren[i];
          // 拿旧子节点 oldVNode 去新的一组子节点中寻找具有相同 key 值的节点
          const has = newChildren.find((c) => c.key === oldVNode.key);
          if (!has) {
            // 如果没有找到具有相同 key 值的节点，则说明需要删除该节点
            // 调用 unmount 函数将其卸载
            unmount(oldVNode);
          }
        }
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
```
