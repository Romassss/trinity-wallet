import assign from 'lodash/assign';
import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import values from 'lodash/values';
import keys from 'lodash/keys';
import isString from 'lodash/isString';
import * as Keychain from 'react-native-keychain';
import { getNonce, createSecretBox, openSecretBox, hexStringToByte, encodeBase64, decodeBase64 } from './crypto';

const keychain = {
    get: (alias) => {
        return new Promise((resolve, reject) => {
            Keychain.getInternetCredentials(alias)
                .then((credentials) => {
                    if (isEmpty(credentials)) {
                        resolve(null);
                    } else {
                        const payload = {
                            nonce: get(credentials, 'username'),
                            box: get(credentials, 'password'),
                        };

                        resolve(payload);
                    }
                })
                .catch((err) => reject(err));
        });
    },
    clear: (alias) => {
        return new Promise((resolve, reject) => {
            Keychain.resetInternetCredentials(alias)
                .then(() => resolve())
                .catch((err) => reject(err));
        });
    },
    set: (alias, nonce, box) => {
        return new Promise((resolve, reject) => {
            Keychain.setInternetCredentials(alias, nonce, box)
                .then(() => resolve())
                .catch((err) => reject(err));
        });
    },
};

export const getSecretBoxFromKeychainAndOpenIt = async (alias, key) => {
    const secretBox = await keychain.get(alias);
    const boxUInt8 = await decodeBase64(secretBox.box);
    const nonceUInt8 = await decodeBase64(secretBox.nonce);
    const keyUInt8 = hexStringToByte(key);
    return await openSecretBox(boxUInt8, nonceUInt8, keyUInt8);
};

export const createAndStoreBoxInKeychain = async (key, message, alias) => {
    const nonce = await getNonce();
    const box = await createSecretBox(message, nonce, key);
    const nonce64 = await encodeBase64(nonce);
    const box64 = await encodeBase64(box);
    return keychain.set(alias, nonce64, box64);
};

export const storeSeedInKeychain = async (pwdHash, seed, name, alias = 'seeds') => {
    const existingInfo = await keychain.get(alias);
    const info = { [name]: seed };

    // If this is the first seed, store the seed with account name
    if (isEmpty(existingInfo)) {
        return createAndStoreBoxInKeychain(pwdHash, info, alias);
    }
    // If this is an additional seed, get existing seed info and update with new seed info before storing
    const existingSeedInfo = await getSecretBoxFromKeychainAndOpenIt(alias, pwdHash);
    const updatedSeedInfo = assign({}, existingSeedInfo, info);
    return createAndStoreBoxInKeychain(pwdHash, updatedSeedInfo, alias);
};

export const getAllSeedsFromKeychain = async (pwdHash) => {
    return await getSecretBoxFromKeychainAndOpenIt('seeds', pwdHash);
};

/*export const logSeeds = async (pwdHash) => {
    const seeds = await getSecretBoxFromKeychainAndOpenIt('seeds', pwdHash);
    console.log(seeds);
};

export const logTwoFa = async (pwdHash) => {
    const twofa = await getSecretBoxFromKeychainAndOpenIt('authKey', pwdHash);
    console.log(twofa);
};*/

export const getSeedFromKeychain = async (pwdHash, accountName) => {
    return (await getSecretBoxFromKeychainAndOpenIt('seeds', pwdHash))[accountName];
};

export const getTwoFactorAuthKeyFromKeychain = async (pwdHash) => {
    return await getSecretBoxFromKeychainAndOpenIt('authKey', pwdHash);
};

export const storeTwoFactorAuthKeyInKeychain = async (pwdHash, authKey, alias = 'authKey') => {
    // Should only allow storing two factor authkey if the user has an account
    const info = await keychain.get('seeds');
    const shouldNotAllow = !info;

    if (!isString(authKey)) {
        throw new Error('Invalid two factor authentication key.');
    } else if (shouldNotAllow) {
        throw new Error('Cannot store two factor authentication key.');
    }
    return createAndStoreBoxInKeychain(pwdHash, authKey, alias);
};

export const hasDuplicateAccountName = (seedInfo, accountName) => {
    return keys(seedInfo).indexOf(accountName) > -1;
};

export const hasDuplicateSeed = (seedInfo, seed) => {
    return values(seedInfo).indexOf(seed) > -1;
};

export const updateAccountNameInKeychain = async (pwdHash, oldAccountName, newAccountName, alias = 'seeds') => {
    const seedInfo = await getAllSeedsFromKeychain(pwdHash);
    if (oldAccountName !== newAccountName) {
        Object.defineProperty(seedInfo, newAccountName, Object.getOwnPropertyDescriptor(seedInfo, oldAccountName));
        delete seedInfo[oldAccountName];
    }
    return createAndStoreBoxInKeychain(pwdHash, seedInfo, alias);
};

export const deleteSeedFromKeychain = async (pwdHash, accountNameToDelete, alias = 'seeds') => {
    const seedInfo = await getAllSeedsFromKeychain(pwdHash);
    if (seedInfo) {
        delete seedInfo[accountNameToDelete];
        return createAndStoreBoxInKeychain(pwdHash, seedInfo, alias);
    }
    return Promise.reject(new Error('Something went wrong while deleting from keychain.'));
};

export const deleteTwoFactorAuthKeyFromKeychain = async (alias = 'authKey') => {
    return await keychain.clear(alias);
};

export default keychain;
