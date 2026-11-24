import {
	randomBytes,
	scryptSync,
	timingSafeEqual,
	createHash,
	createCipheriv,
	createDecipheriv
} from 'node:crypto';
export const token = () => randomBytes(32).toString('hex');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function hashPassword(value: string) {
	const salt = randomBytes(16).toString('hex');
	return `${salt}:${scryptSync(value, salt, 64).toString('hex')}`;
}
export function verifyPassword(value: string, stored: string) {
	const [salt, hash] = stored.split(':');
	const candidate = scryptSync(value, salt, 64);
	return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}
function key() {
	const value = process.env.SETTINGS_ENCRYPTION_KEY;
	if (!value || !/^[a-f0-9]{64}$/i.test(value))
		throw new Error('Set SETTINGS_ENCRYPTION_KEY before storing credentials.');
	return Buffer.from(value, 'hex');
}
export function encrypt(value: string) {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key(), iv);
	const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
	return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(
		':'
	);
}
export function decrypt(value: string) {
	if (!value) return '';
	const [iv, tag, data] = value.split(':');
	const cipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'hex'));
	cipher.setAuthTag(Buffer.from(tag, 'hex'));
	return Buffer.concat([cipher.update(Buffer.from(data, 'hex')), cipher.final()]).toString('utf8');
}
