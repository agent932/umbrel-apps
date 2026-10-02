// The engine runs in browsers and Node, so it declares only the shared globals it uses
// rather than depending on DOM or Node typings.
declare function structuredClone<T>(value: T): T;
// eslint-disable-next-line no-var -- ambient globals must be declared with var
declare var crypto: { getRandomValues<T extends ArrayBufferView>(array: T): T };
