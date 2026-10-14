import type { Action } from '../../rule-model/schema';

export type ActionIconName =
  | 'redirect'
  | 'block'
  | 'headers'
  | 'inject-js'
  | 'inject-css'
  | 'mock'
  | 'body'
  | 'local';

export function actionIconName(type: Action['type']): ActionIconName {
  switch (type) {
    case 'redirect':
      return 'redirect';
    case 'block':
      return 'block';
    case 'modifyHeaders':
      return 'headers';
    case 'injectJs':
      return 'inject-js';
    case 'injectCss':
      return 'inject-css';
    case 'mock':
      return 'mock';
    case 'overrideBody':
      return 'body';
    case 'serveLocal':
      return 'local';
  }
}
