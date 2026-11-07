export function el(tag, options = {}, children = []) {
    const element = document.createElement(tag);
    if (options.className) element.className = options.className;
    if (options.text !== undefined) element.textContent = options.text;
    if (options.id) element.id = options.id;
    if (options.disabled) element.disabled = true;
    if (options.src) element.src = options.src;
    if (options.alt) element.alt = options.alt;
    if (options.style) Object.assign(element.style, options.style);
    if (options.onClick) element.addEventListener("click", options.onClick);

    children.forEach(child => {
        if (!child) return;
        if (typeof child === "string" || typeof child === "number") {
            element.appendChild(document.createTextNode(String(child)));
        } else {
            element.appendChild(child);
        }
    });
    return element;
}
