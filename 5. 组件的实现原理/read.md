## 组件的实现原理

### 一、 渲染组件

1. `typeof vnode.type === 'object'`代表组件；
2. `componentOptions.render()`返回组件要渲染的虚拟 DOM 节点。
   例如：

```
const MyCompoent = {
  // 组件名称，可选
  name: 'my-component',
  // 渲染函数
  render() {
    return {
      type: 'div',
      children: '我是文本内容'
    }
  }
}

// 用来描述组件的 VNode 对象，type 属性值为组件的选项对象
const CompVNode = {
  type: MyComponent
}
// 调用渲染器来渲染组件
renderer.render(CompVNode, document.querySelector('#app'))
```

### 二、组件的状态与自更新

1. 调用`data()`获取原始值，并使用`reative`对其包装成响应式对象；
2. 调用`effect()`，当组件响应式对象数据改变时，会自动调用副作用函数；
3. 由于 `effect` 的执行是同步的，做一个微任务的异步执行机制，使得无论对响应式数据进行多次修改，副作用函数只会执行一次。

### 三、组件实例与组件的生命周期

1. 痛点：组件更新时，都会进行全新的挂载，而不会打补丁；
2. 解决方法：将组件实例挂载到组件上，根据实例判断是挂载还是更新操作。

### 四、props 与 组件的被动更新

### 五、setup 函数

1. 返回一个函数，代表 `render` 函数;
2. 返回一个对象，代表存在模板；
3. `setup`函数返回的数据状态应该暴露到渲染环境。
