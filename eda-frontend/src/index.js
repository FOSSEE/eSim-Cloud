// This is the JavaScript entry point of react application.
import React from 'react'
import ReactDOM from 'react-dom'
import * as serviceWorker from './serviceWorker'
import './index.css'
import App from './App'
import { Provider } from 'react-redux'
import store from './redux/store'
import { ThemeContextProvider } from './context/ThemeContext'
import { applyDocumentTheme, getInitialDarkMode } from './themeStorage'

applyDocumentTheme(getInitialDarkMode())

ReactDOM.render(
  <ThemeContextProvider>
    <Provider store={store}>
      <App />
    </Provider>
  </ThemeContextProvider>,
  document.getElementById('root')
)

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister()
