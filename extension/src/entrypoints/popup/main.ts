import { mount } from 'svelte';
import { browser } from 'wxt/browser';
import { applyTheme, loadTheme } from '../../ui/theme';
import App from './App.svelte';
import '../../ui/base.css';

applyTheme(await loadTheme(browser.storage.local));
mount(App, { target: document.getElementById('app')! });
