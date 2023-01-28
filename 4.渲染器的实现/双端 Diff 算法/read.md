## 双端 Diff 算法

### 一、 痛点

![avatar](./images/%E5%9B%BE1.jpg)
以上面图片为例，如果用简单 Diff 算法 DOM 会移动两次，但实际上只需要 P3 移动一次就够了

### 二、双端 Diff 算法

1. 旧头部节点与新头部节点(oldStartVNode、newStartVNode)比较，相等的话，打补丁，更新索引位置(++oldStartIdx, ++newStartIdx)；
2. 旧尾部节点与新尾部节点(oldEndVNode、newEndVNode)比较，打补丁，更新索引位置(--oldEndIdx, --newEndIdx)；
3. 旧头部节点与新尾部节点(oldStartVNode、newEndVNode)比较，打补丁，将 oldStartVNode.el 移动到 oldEndVNode.el.nextSibling 前面，更新索引(++oldStartIdx, --newEndIdx)；
4. 旧尾部节点与新头部节点(oldEndVNode、newStartVNode)比较，打补丁，将 oldEndVNode.el 移动到 oldStartVNode.el 前面，更新索引(--oldEndIdx, ++newStartIdx)。
