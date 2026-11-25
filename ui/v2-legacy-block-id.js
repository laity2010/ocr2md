/** WP25B: read-only recognition of retired WP23G artificial identities. */
export const SYNTHETIC_ID_MIN=2**48;
export const SYNTHETIC_ID_MAX=2**49-1;
export const isSyntheticId=id=>Number.isSafeInteger(id)&&id>=SYNTHETIC_ID_MIN&&id<=SYNTHETIC_ID_MAX;
