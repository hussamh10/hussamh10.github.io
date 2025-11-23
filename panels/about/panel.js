document.querySelectorAll('.expandable-trigger').forEach(function(dotsElement) {
    dotsElement.addEventListener('click', function() {
        // Get the ID number from the dots element
        var dotsId = this.id;
        var idNumber = dotsId.split('-').pop();
        
        // Find the corresponding content element
        var contentElement = document.getElementById('expandable-content-' + idNumber);
        
        if (contentElement && contentElement.classList.contains('expandable-hidden')) {
            // Hide the trigger
            this.style.display = 'none';
            
            // Store the full HTML content
            var fullContent = contentElement.innerHTML;
            var plainText = contentElement.textContent || contentElement.innerText;
            
            // Show the element but empty it first
            contentElement.classList.remove('expandable-hidden');
            contentElement.classList.add('expandable-visible');
            contentElement.innerHTML = '';
            
            // Type out character by character
            var charIndex = 0;
            var typingSpeed = 15; // milliseconds per character
            
            function typeCharacter() {
                if (charIndex < plainText.length) {
                    // Get the portion of HTML that corresponds to characters revealed so far
                    var tempDiv = document.createElement('div');
                    tempDiv.innerHTML = fullContent;
                    var revealedText = plainText.substring(0, charIndex + 1);
                    
                    // Simple approach: reveal HTML progressively
                    var htmlSoFar = '';
                    var textSoFar = '';
                    var parser = new DOMParser();
                    var doc = parser.parseFromString(fullContent, 'text/html');
                    
                    function extractUpToLength(node, targetLength) {
                        var result = '';
                        var currentLength = textSoFar.length;
                        
                        for (var i = 0; i < node.childNodes.length; i++) {
                            var child = node.childNodes[i];
                            
                            if (currentLength >= targetLength) break;
                            
                            if (child.nodeType === Node.TEXT_NODE) {
                                var text = child.textContent;
                                var remainingChars = targetLength - currentLength;
                                if (text.length <= remainingChars) {
                                    result += text;
                                    textSoFar += text;
                                    currentLength += text.length;
                                } else {
                                    var partial = text.substring(0, remainingChars);
                                    result += partial;
                                    textSoFar += partial;
                                    currentLength += partial.length;
                                }
                            } else if (child.nodeType === Node.ELEMENT_NODE) {
                                var tagName = child.tagName.toLowerCase();
                                var attrs = '';
                                for (var j = 0; j < child.attributes.length; j++) {
                                    var attr = child.attributes[j];
                                    attrs += ' ' + attr.name + '="' + attr.value + '"';
                                }
                                result += '<' + tagName + attrs + '>';
                                result += extractUpToLength(child, targetLength);
                                result += '</' + tagName + '>';
                                
                                if (textSoFar.length >= targetLength) break;
                            }
                        }
                        return result;
                    }
                    
                    contentElement.innerHTML = extractUpToLength(doc.body, charIndex + 1);
                    charIndex++;
                    setTimeout(typeCharacter, typingSpeed);
                } else {
                    // Ensure final content is complete
                    contentElement.innerHTML = fullContent;
                }
            }
            
            typeCharacter();
        }
    });
});
