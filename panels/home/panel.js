export function init(hostEl) {
  const root = hostEl instanceof Element ? hostEl : document;

  const ac = new AbortController();
  const { signal } = ac;

  root.querySelectorAll(".expandable-trigger").forEach((dotsElement) => {
    if (!(dotsElement instanceof HTMLElement)) return;
    if (dotsElement.dataset.expandableBound === "1") return;
    dotsElement.dataset.expandableBound = "1";

    dotsElement.addEventListener(
      "click",
      function () {
        // Get the ID number from the dots element
        const dotsId = this.id || "";
        const idNumber = dotsId.split("-").pop();

        // Find the corresponding content element (scoped to this panel)
        const contentElement = root.querySelector(`#expandable-content-${idNumber}`);

        if (contentElement && contentElement.classList.contains("expandable-hidden")) {
          // Hide the trigger
          this.style.display = "none";

          // Store the full HTML content
          const fullContent = contentElement.innerHTML;
          const plainText = contentElement.textContent || contentElement.innerText || "";

          // Show the element but empty it first
          contentElement.classList.remove("expandable-hidden");
          contentElement.classList.add("expandable-visible");
          contentElement.innerHTML = "";

          // Type out character by character
          let charIndex = 0;
          const typingSpeed = 15; // ms per character

          function typeCharacter() {
            if (signal.aborted) return;

            if (charIndex < plainText.length) {
              let textSoFar = "";
              const parser = new DOMParser();
              const doc = parser.parseFromString(fullContent, "text/html");

              function extractUpToLength(node, targetLength) {
                let result = "";
                let currentLength = textSoFar.length;

                for (let i = 0; i < node.childNodes.length; i += 1) {
                  const child = node.childNodes[i];
                  if (currentLength >= targetLength) break;

                  if (child.nodeType === Node.TEXT_NODE) {
                    const text = child.textContent || "";
                    const remainingChars = targetLength - currentLength;
                    if (text.length <= remainingChars) {
                      result += text;
                      textSoFar += text;
                      currentLength += text.length;
                    } else {
                      const partial = text.substring(0, remainingChars);
                      result += partial;
                      textSoFar += partial;
                      currentLength += partial.length;
                    }
                  } else if (child.nodeType === Node.ELEMENT_NODE) {
                    const el = child;
                    const tagName = el.tagName.toLowerCase();
                    let attrs = "";
                    for (let j = 0; j < el.attributes.length; j += 1) {
                      const attr = el.attributes[j];
                      attrs += ` ${attr.name}="${attr.value}"`;
                    }
                    result += `<${tagName}${attrs}>`;
                    result += extractUpToLength(child, targetLength);
                    result += `</${tagName}>`;
                    if (textSoFar.length >= targetLength) break;
                  }
                }
                return result;
              }

              contentElement.innerHTML = extractUpToLength(doc.body, charIndex + 1);
              charIndex += 1;
              setTimeout(typeCharacter, typingSpeed);
            } else {
              // Ensure final content is complete
              contentElement.innerHTML = fullContent;
            }
          }

          typeCharacter();
        }
      },
      { signal }
    );
  });

  // Cleanup function for app.js to call when panel unmounts
  return () => ac.abort();
}
