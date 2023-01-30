## 双端 Diff 算法

### 一、 痛点

![avatar](./images/%E5%9B%BE1.jpg)
以上面图片为例，如果用简单 Diff 算法 DOM 会移动两次，但实际上只需要 P3 移动一次就够了

### 二、原理

1. 旧头部节点与新头部节点(`oldStartVNode`、`newStartVNode`)比较，相等的话，打补丁，更新索引位置(`++oldStartIdx`, `++newStartIdx`)；
2. 旧尾部节点与新尾部节点(`oldEndVNode`、`newEndVNode`)比较，打补丁，更新索引位置(`--oldEndIdx`, `--newEndIdx`)；
3. 旧头部节点与新尾部节点(`oldStartVNode`、`newEndVNode`)比较，打补丁，将 oldStartVNode.el 移动到 `oldEndVNode.el.nextSibling` 前面，更新索引(`++oldStartIdx`, `--newEndIdx`)；
4. 旧尾部节点与新头部节点(`oldEndVNode`、`newStartVNode`)比较，打补丁，将 `oldEndVNode.el` 移动到 `oldStartVNode.el` 前面，更新索引(`--oldEndIdx`, `++newStartIdx`)。

### 三、优势

更少的移动 DOM

### 四、非理想状况的处理方式

![avatar](./images/%E9%9D%9E%E7%90%86%E6%83%B3%E7%8A%B6%E6%80%81%E4%B8%8B%E5%8F%8C%E7%AB%AF%E7%AE%97%E6%B3%95%E5%8E%9F%E7%90%86.jpg)
如上图所示，在四个步骤的比较过程中，都无法找到可复用的节点。
解决方法：

1. 拿新的一组子节点中的头部节点去旧的一组子节点中寻找；
2. 打补丁，移动查找到的子节点到旧子节点数组头部；
3. 将旧子节点置为 `undefined` 意味处理过了；
4. 四个步骤前增加两个判断分支，如果头尾部节点为 `undefined` 意味着该节点被处理过了，直接跳到下一个位置。

### 五、添加新元素

1. 新头部节点查找，找不到，说明是新增元素，直接挂载；
2. 满足 oldStartIdx > oldEndIdx && newStartIdx <= newEndIdx 条件时，说明是遗留节点，循环遍历直接挂载。
