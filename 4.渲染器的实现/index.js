const { ref, effect } = VueReactivity;

const count = ref(1);
function renderer(domString, container) {
  container.innerHTML = domString;
}

effect(() => {
  renderer(`<h1>${count.value}</h1>`, document.getElementById("app"));
});

count.value++;
