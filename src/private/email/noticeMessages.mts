import { throwInternalError } from '@throw/throwInternalError.mjs'

import { escapeHtml } from './escapeHtml.mjs'
import { FALLBACK_FOOTER, standaloneHeader } from './htmlFrame.mjs'
import type { IEmailContent } from './IEmailContent.mjs'

function paragraph(subject: string, text: string): IEmailContent {
	return { subject, textBody: text, htmlBody: `<p>${text}</p>` }
}

export const ACCOUNT_DISABLED = paragraph(
	'Your account has been disabled',
	'Hi, we are sorry but your account has been disabled. Contact us for more information.'
)

export const ACCOUNT_BANNED = paragraph(
	'Your account has been banned',
	'Hi, we are sorry but your account has been banned. Contact us for more information.'
)

export const EMAIL_ALREADY_VALID = paragraph('Account already valid', 'Hi, your account is already valid, you can log in.')

/** Activation link expired. */
export const HASH_REQ_TOO_OLD = paragraph(
	'Activation link expired',
	'Hi, the activation link you are trying to use is older than 3 days and has expired. You need to repeat the registration request.'
)

/** Too many verification attempts. The HTML part words the limit differently from the text part. */
export const TOO_MUCH_VERIFY_REQUESTS: IEmailContent = {
	subject: 'Too many attempts to verify your email',
	textBody: 'Hi, you have made more than 5 attempts to verify your email. You need to repeat the registration request.',
	htmlBody: '<p>Hi, you have made 5 or more attempts to verify your email. You need to repeat the registration request.</p>'
}

/** Wrong activation link. Past 5 attempts it throws instead; `times` is a number, so the remaining count needs no escaping. */
export function wrongHashMessage(times: number): IEmailContent {
	if (times > 5) throwInternalError()
	return paragraph(
		'Wrong activation link',
		`Hi, you or someone else is trying to verify your email with a wrong link. You have ${5 - times} attempts remaining.`
	)
}

/** Dev-team alert. `err` goes into the HTML part escaped and into the text part as is. */
export function alertDevMessage(platformName: string, err: string): IEmailContent {
	return {
		subject: `${platformName} error 500`,
		textBody: 'error 500 ' + err,
		htmlBody: '<p>error 500 <br><br>' + escapeHtml(err) + '</p>'
	}
}

/** Report notice for the dev team. Name, surname and id come from user data, so the HTML part escapes them. */
export function postReportedMessage(idPost: number | string, name: string, surname: string, userId: string): IEmailContent {
	const subject = 'Post ' + idPost + ' reported'
	return {
		subject,
		textBody: 'Hi, post ' + idPost + ' has been reported by ' + name + ' ' + surname + ' (id: ' + userId + ').',
		htmlBody:
			standaloneHeader(subject) +
			'Hi, post ' +
			escapeHtml(idPost) +
			' has been reported by ' +
			escapeHtml(name) +
			' ' +
			escapeHtml(surname) +
			' (id: ' +
			escapeHtml(userId) +
			').' +
			FALLBACK_FOOTER
	}
}
