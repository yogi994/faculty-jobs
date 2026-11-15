import { registerRootComponent } from 'expo';

import App from './App';
// Registers the background job check before the app starts, so it can run while the app is closed.
import './src/notify';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
