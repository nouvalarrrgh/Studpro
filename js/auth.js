// js/auth.js
import { supabaseClient } from './supabase.js';

let isLoginMode = true;

document.addEventListener('DOMContentLoaded', async () => {
  // Redirect jika sesi sudah aktif
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) window.location.href = 'index.html';

  const form = document.getElementById('auth-form');
  const toggleBtn = document.getElementById('toggle-mode');
  const title = document.querySelector('h1');
  const submitBtn = document.getElementById('btn-submit');
  const msgBox = document.getElementById('msg-box');

  toggleBtn.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    title.textContent = isLoginMode ? 'Welcome Back' : 'Create Account';
    submitBtn.textContent = isLoginMode ? 'Sign In' : 'Sign Up';
    toggleBtn.textContent = isLoginMode ? 'Register here' : 'Login here';
    msgBox.classList.add('hidden');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
      if (isLoginMode) {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = 'index.html';
      } else {
        // 1. Daftar ke Supabase Auth
        const { error: authError } = await supabaseClient.auth.signUp({ email, password });
        if (authError) throw authError;

        // 2. Insert otomatis ke tabel kustom 'users' milik Anda untuk mendapatkan id tipe Integer
        const username = email.split('@')[0] + Math.floor(Math.random() * 1000);
        const { error: dbError } = await supabaseClient.from('users').insert([{ 
          username: username,
          email: email,
          password: password // Disimpan untuk memenuhi 'password TEXT NOT NULL' di skema Anda
        }]);
        
        if (dbError) throw dbError;

        showMessage('Registration successful! Please sign in.', 'success');
        isLoginMode = true;
        title.textContent = 'Welcome Back';
        submitBtn.textContent = 'Sign In';
        toggleBtn.textContent = 'Register here';
      }
    } catch (error) {
      showMessage(error.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isLoginMode ? 'Sign In' : 'Sign Up';
    }
  });

  function showMessage(msg, type) {
    msgBox.textContent = msg;
    msgBox.className = `p-3 rounded-xl text-sm font-medium mb-4 block ${type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`;
  }
});