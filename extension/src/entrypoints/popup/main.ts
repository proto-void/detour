import { mount } from 'svelte';
import App from './App.svelte';
import '../../ui/base.css';

mount(App, { target: document.getElementById('app')! });
