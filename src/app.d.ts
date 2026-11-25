declare global {
	namespace App {
		interface Locals {
			pageLanguage?: string;
			user?: { id: string; username: string };
		}
	}
}
export {};
