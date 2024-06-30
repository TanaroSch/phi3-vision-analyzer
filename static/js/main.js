// static/js/main.js
document.addEventListener('DOMContentLoaded', (event) => {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const promptTextarea = document.getElementById('prompt');
    const imagePreview = document.getElementById('imagePreview');
    const imageUrlInput = document.getElementById('imageUrl');
    const analyzeButton = document.getElementById('analyzeButton');
    const resultPromptDiv = document.getElementById('resultPrompt');
    const resultAnswerDiv = document.getElementById('resultAnswer');
    const saveResultsButton = document.getElementById('saveResults');
    const darkModeToggle = document.getElementById('darkModeToggle');
    let selectedFile = null;
    let isAnalyzing = false;

    // Dark mode toggle
    darkModeToggle.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        localStorage.setItem('darkMode', document.documentElement.classList.contains('dark'));
    });

    // Check for saved dark mode preference
    if (localStorage.getItem('darkMode') === 'true') {
        document.documentElement.classList.add('dark');
    }

    function updatePreview(src) {
        if (src) {
            imagePreview.src = src;
            imagePreview.classList.remove('hidden');
        } else {
            imagePreview.classList.add('hidden');
        }
    }

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('bg-gray-200', 'dark:bg-gray-700');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('bg-gray-200', 'dark:bg-gray-700');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('bg-gray-200', 'dark:bg-gray-700');
        selectedFile = e.dataTransfer.files[0];
        dropZone.textContent = `Selected: ${selectedFile.name}`;
        updatePreview(URL.createObjectURL(selectedFile));
    });
    fileInput.addEventListener('change', (e) => {
        selectedFile = e.target.files[0];
        dropZone.textContent = `Selected: ${selectedFile.name}`;
        updatePreview(URL.createObjectURL(selectedFile));
    });
    imageUrlInput.addEventListener('input', () => {
        if (imageUrlInput.value) {
            updatePreview(imageUrlInput.value);
        }
    });

    promptTextarea.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isAnalyzing) {
                analyze();
            }
        }
    });

    async function analyze() {
        if (isAnalyzing) return;
        
        isAnalyzing = true;
        analyzeButton.disabled = true;
        resultPromptDiv.textContent = 'Analyzing...';
        resultAnswerDiv.textContent = '';

        const formData = new FormData();
        formData.append('prompt', promptTextarea.value);
        
        if (selectedFile) {
            formData.append('image_source', 'file');
            formData.append('image_file', selectedFile);
        } else if (imageUrlInput.value) {
            formData.append('image_source', 'url');
            formData.append('image_url', imageUrlInput.value);
        } else {
            resultAnswerDiv.textContent = 'Please select an image or provide a URL.';
            isAnalyzing = false;
            analyzeButton.disabled = false;
            return;
        }

        try {
            const response = await fetch('/analyze', {
                method: 'POST',
                body: formData
            });

            const reader = response.body.getReader();
            let result = '';

            while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                
                const text = new TextDecoder().decode(value);
                result += text;
                
                resultPromptDiv.textContent = promptTextarea.value;
                resultAnswerDiv.textContent = result.replace('<eos>', '').trim();

                if (text.includes('<eos>')) {
                    break;
                }
            }
        } catch (error) {
            resultAnswerDiv.textContent = 'An error occurred: ' + error;
        } finally {
            isAnalyzing = false;
            analyzeButton.disabled = false;
        }
    }

    analyzeButton.addEventListener('click', analyze);

    saveResultsButton.addEventListener('click', () => {
        const prompt = resultPromptDiv.textContent;
        const answer = resultAnswerDiv.textContent;
        const timestamp = new Date().toISOString();
        
        const resultText = `Analysis Result (${timestamp})
Prompt: ${prompt}

Answer: ${answer}`;

        const blob = new Blob([resultText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analysis_result_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
});