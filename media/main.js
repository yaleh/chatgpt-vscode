// @ts-ignore 

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
  const vscode = acquireVsCodeApi();

  let response = '';

  // Handle messages sent from the extension to the webview
  window.addEventListener("message", (event) => {
    const message = event.data;
    switch (message.type) {
      case "addResponse": {
        response = message.value;
        setResponse();
        break;
      }
      case "clearResponse": {
        response = '';
        break;
      }
      case "setPrompt": {
        document.getElementById("prompt-input").value = message.value;
        break;
      }
      case "setDisplayingMode": {
        mode = message.value;
        if (mode === "asking") {
          toggleStopButton(true);
        } else {
          toggleStopButton(false);
        }
        break;
      }
    }
  });

  function fixCodeBlocks(response) {
    // Use a regular expression to find all occurrences of the substring in the string
    const REGEX_CODEBLOCK = new RegExp('\`\`\`', 'g');
    const matches = response.match(REGEX_CODEBLOCK);

    // Return the number of occurrences of the substring in the response, check if even
    const count = matches ? matches.length : 0;
    if (count % 2 === 0) {
      return response;
    } else {
      // else append ``` to the end to make the last code block complete
      return response.concat('\n\`\`\`');
    }

  }

  let lastMessageId = null;

  function setResponse(messageId = null) {
    // var renderer = new marked.Renderer();

    // renderer.code = function (code, language) {
    //   var highlightedCode = microlight.highlight(code);
    //   return '<pre><code class="block overflow-x-scroll p-2 my-2">' + highlightedCode + '</code></pre>';
    // };

    // var options = {
    //   omitExtraWLInCodeBlocks: true,
    //   simplifiedAutoLink: true,
    //   excludeTrailingPunctuationFromURLs: true,
    //   literalMidWordUnderscores: true,
    //   breaks: true
    // };

    // var converter = new marked.Converter(options);
    // converter.setOptions(options);
    // converter.setRenderer(renderer);

    response = fixCodeBlocks(response);
    html = marked.parse(response);

    var responseDiv = document.getElementById("responses");

    if ((responseDiv.childElementCount > 0 && responseDiv.lastChild !== null) && (messageId === null || messageId === lastMessageId)) {
      // Update the existing response
      responseDiv.lastChild.innerHTML = html;
    } else {
      // Create a new div and append it to the "response" div
      var newDiv = document.createElement('div');
      newDiv.classList.add('response');
      newDiv.innerHTML = html;
      responseDiv.appendChild(newDiv);
    }

    var codeBlocks = document.querySelectorAll('code.block');
    for (var i = 0; i < codeBlocks.length; i++) {
      // Check if innertext starts with "Copy code"
      if (codeBlocks[i].innerText.startsWith("Copy code")) {
        codeBlocks[i].innerText = codeBlocks[i].innerText.replace("Copy code", "");
      }

      codeBlocks[i].classList.add("inline-flex", "max-w-full", "overflow-hidden", "rounded-sm", "cursor-pointer");

      var insertButton = document.createElement('button');
      insertButton.textContent = "Insert";
      insertButton.classList.add("text-xs", "font-medium", "leading-5", "text-white", "bg-indigo-600", "hover:bg-indigo-500", "focus:outline-none", "focus:ring", "focus:ring-indigo-500", "focus:ring-opacity-50", "px-2", "py-1", "rounded-sm");

      var codeBlock = codeBlocks[i];
      codeBlock.parentNode.insertBefore(insertButton, codeBlock);

      insertButton.style.display = "block";
      codeBlock.style.display = "block";

      insertButton.addEventListener('click', function (e) {
        e.preventDefault();
        var code = this.nextElementSibling.innerText;
        vscode.postMessage({
          type: 'codeSelected',
          value: code
        });
      });

      const d = document.createElement('div');
      d.innerHTML = codeBlocks[i].innerHTML;
      codeBlocks[i].innerHTML = null;
      codeBlocks[i].appendChild(d);
      d.classList.add("code");
    }

    microlight.reset('code');
  }

  function toggleStopButton(enableld) {
    const button = document.getElementById('stop-button');
    if (enableld) {
      button.disabled = false;
      button.classList.remove('bg-gray-400', 'cursor-not-allowed');
      button.classList.add('bg-red-600', 'hover:bg-red-700');
    } else {
      button.disabled = true;
      button.classList.remove('bg-red-600', 'hover:bg-red-700');
      button.classList.add('bg-gray-400', 'cursor-not-allowed');
    }
  }

  toggleStopButton(false);

  // Listen for keyup events on the prompt input element
  document.getElementById('prompt-input').addEventListener('keyup', function (e) {
    // If the key that was pressed was the Enter key
    if (e.keyCode === 13) {
      vscode.postMessage({
        type: 'prompt',
        value: this.value
      });
    }
  });

  // Listen for click events on the stop button
  document.getElementById('stop-button').addEventListener('click', function () {
    vscode.postMessage({
      type: 'abort'
    });
  });
})();
