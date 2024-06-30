# app.py
from flask import Flask, render_template, request, jsonify, Response
from transformers import AutoProcessor, AutoModelForCausalLM
import torch
from PIL import Image
import requests
from io import BytesIO
from threading import Thread
import logging
import traceback
import os
from dotenv import load_dotenv
from huggingface_hub import login

load_dotenv()

app = Flask(__name__)

# Set up logging
logging.basicConfig(level=logging.DEBUG)

# Hugging Face token setup
hf_token = os.getenv('HUGGINGFACE_TOKEN')
if not hf_token:
    app.logger.warning("HUGGINGFACE_TOKEN not found in .env file. You may not be able to download the model if it's not available locally.")

# Model setup
model_id = "microsoft/phi-3-vision-128k-instruct"
model_path = os.getenv('MODEL_PATH', './model')
device = "cuda" if torch.cuda.is_available() else "cpu"

# Authenticate with Hugging Face if token is available
if hf_token:
    login(token=hf_token)

try:
    # First, try to load the model from the local path
    if os.path.exists(model_path):
        app.logger.info(f"Loading model from local path: {model_path}")
        processor = AutoProcessor.from_pretrained(model_path, trust_remote_code=True)
        model = AutoModelForCausalLM.from_pretrained(
            model_path, 
            trust_remote_code=True, 
            torch_dtype=torch.float16 if device == "cuda" else torch.float32,
            use_flash_attention_2=False  # Disable FlashAttention2
        ).to(device)
    else:
        # If local path doesn't exist, try to download from Hugging Face
        app.logger.info(f"Local model not found. Attempting to download from Hugging Face: {model_id}")
        processor = AutoProcessor.from_pretrained(model_id, token=hf_token, trust_remote_code=True)
        model = AutoModelForCausalLM.from_pretrained(
            model_id, 
            token=hf_token, 
            trust_remote_code=True, 
            torch_dtype=torch.float16 if device == "cuda" else torch.float32,
            use_flash_attention_2=False  # Disable FlashAttention2
        ).to(device)
    
    app.logger.info(f"Model loaded successfully on {device}")
except Exception as e:
    app.logger.error(f"Error loading model: {str(e)}")
    raise

user_prompt = '<|user|>\n'
assistant_prompt = '<|assistant|>\n'
prompt_suffix = "<|end|>\n"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/analyze', methods=['POST'])
def analyze():
    prompt = request.form['prompt']
    image_source = request.form.get('image_source')
    
    try:
        app.logger.info(f"Analyzing. Source: {image_source}, Prompt: {prompt}")
        
        if image_source == 'url':
            image_url = request.form['image_url']
            app.logger.debug(f"Fetching image from URL: {image_url}")
            response = requests.get(image_url)
            image = Image.open(BytesIO(response.content))
        elif image_source == 'file':
            app.logger.debug("Processing uploaded image file")
            image_file = request.files['image_file']
            image = Image.open(image_file)
        else:
            image = None

        full_prompt = f"{user_prompt}<|image_1|>\n{prompt}{prompt_suffix}{assistant_prompt}"
        
        app.logger.debug("Preparing inputs for model")
        inputs = processor(full_prompt, images=image, return_tensors="pt").to(device)
        
        def generate():
            app.logger.debug("Starting generation")
            generate_ids = model.generate(**inputs, 
                                          max_new_tokens=1000,
                                          eos_token_id=processor.tokenizer.eos_token_id)
            generate_ids = generate_ids[:, inputs['input_ids'].shape[1]:]
            response = processor.batch_decode(generate_ids, 
                                              skip_special_tokens=True, 
                                              clean_up_tokenization_spaces=False)[0]
            app.logger.debug("Generation complete")
            yield response

        return Response(generate(), mimetype='text/plain')
    
    except Exception as e:
        app.logger.error(f"Error during analysis: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)