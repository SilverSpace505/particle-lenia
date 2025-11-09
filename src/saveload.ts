/**
 * Prompts the user to select a .json file and loads its content
 * into a global variable named 'loadedData'.
 */
window.loadJSONFile = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';

  // Listen for when a file is selected
  input.onchange = function (event) {
    if (!event.target) return;
    const files = event.target as unknown as { files: File[] };
    const file = files.files[0];
    if (!file) {
      console.log('No file selected.');
      return;
    }

    // Use FileReader to asynchronously read the file content
    const reader = new FileReader();

    reader.onload = function (e) {
      if (!e.target) return;
      try {
        const jsonString = e.target.result;
        if (typeof jsonString != 'string') return;
        // Parse the JSON string back into a JavaScript object
        const data = JSON.parse(jsonString);

        // Make the loaded object available globally in the console
        window.loadedData = data;
        console.log(`✅ File '${file.name}' loaded successfully!`);
        console.log(
          'The data is now available in the console as the global variable: loadedData',
        );

        // Optional: Log a preview of the data
        console.log(window.loadedData);
      } catch (error) {
        console.error('❌ Error parsing JSON or loading file:', error);
      }

      // Clean up the temporary input element
      document.body.removeChild(input);
    };

    // Read the file content as a text string
    reader.readAsText(file);
  };

  // Temporarily append and trigger the file selection dialog
  document.body.appendChild(input);
  input.click();
};

window.downloadObject = (exportObj: unknown, exportName: string) => {
  // 1. Stringify the object
  // Be cautious with very large objects, circular references (will throw an error
  // unless handled), or objects with BigInts (will also throw).
  // You might want to use JSON.stringify(exportObj, null, 2) for pretty-printing.
  let dataStr;
  try {
    dataStr = JSON.stringify(exportObj);
  } catch (e) {
    console.error('Error stringifying object:', e);
    // Add logic here to handle circular references if necessary
    // E.g., using a custom replacer function.
    return;
  }

  // 2. Create a Blob object
  const blob = new Blob([dataStr], { type: 'application/json' });

  // 3. Create a temporary anchor element
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute('href', URL.createObjectURL(blob));
  downloadAnchorNode.setAttribute('download', exportName + '.json');

  // 4. Append to body, click, and remove
  document.body.appendChild(downloadAnchorNode); // Required for Firefox
  downloadAnchorNode.click();
  document.body.removeChild(downloadAnchorNode);

  // 5. Release the object URL
  URL.revokeObjectURL(downloadAnchorNode.href);
};
