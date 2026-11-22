// The same package seen from a CommonJS consumer (require through the "exports" map).
import wolvyModule = require('@wolvy/node');

const client = new wolvyModule.Wolvy({ apiKey: 'wv_live_x' });
const p: Promise<wolvyModule.Account> = client.account.retrieve();
const vt: string = wolvyModule.signViewerToken('user-1', 60, 's', { video: 'v' });
const err: typeof wolvyModule.WolvyNotFoundError = wolvyModule.WolvyNotFoundError;
void p;
void vt;
void err;
