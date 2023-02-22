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
