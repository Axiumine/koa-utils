import { escapeHtml } from './escapeHtml.mjs'
import { FALLBACK_FOOTER, standaloneHeader } from './htmlFrame.mjs'
import type { IEmailContent } from './IEmailContent.mjs'
import { fixName, htmlLink } from './messageParts.mjs'

/** Password-reset request. `link` is the finished reset URL. */
export function resetMessage(platformName: string, link: string, name: string): IEmailContent {
	const nameFixed = fixName(name)
	return {
		subject: `Password reset for ${platformName}`,
		textBody: `Hi${nameFixed}, you or someone else has requested a password reset. You can change your login password
      by copying this link ${link} into your browser. The Team.`,
		htmlBody: `Hi${escapeHtml(nameFixed)},<br>you or someone else has requested a password reset.<br><br>
      You can change your password by clicking the link:<br>${htmlLink(link)}
      <br><br>The Team.`
	}
}

/** Confirmation that the new password is set, linking to the platform home. */
export function resetConfirmationMessage(platformName: string, linkBase: string, name: string): IEmailContent {
	const nameFixed = fixName(name)
	return {
		subject: `Password reset for ${platformName}`,
		textBody: `Hi${nameFixed}, you have confirmed your new password. You can now log in at: ${linkBase}. The Team.`,
		htmlBody: `Hi${escapeHtml(nameFixed)},<br>you have confirmed your new password.<br><br>You can now log in at:<br>${htmlLink(linkBase, platformName)}<br><br>The Team.`
	}
}

/** Recipient of the legacy confirmation mail: the address, the greeting name and the reset hash. */
interface ILegacyRecipient {
	email: string
	name: string
	hash: string
}

/**
 * Legacy confirmation mail whose HTML part is a full standalone document. The reset URL carries the hash and
 * the `encodeURI`d address in its query string; it only appears in the HTML part, so it is escaped there.
 */
export function resetConfirmationHashMessage(platformName: string, linkBase: string, to: ILegacyRecipient): IEmailContent {
	const subject = `Password change confirmation for ${platformName}`
	const linkReset = linkBase + '/index.php?q=reset&hash=' + to.hash + '&email=' + encodeURI(to.email)
	return {
		subject,
		textBody: 'Hi ' + to.name + ', you have confirmed your new password. You can now log in at: ' + linkBase + ' . ',
		htmlBody:
			standaloneHeader(subject) +
			'Hi ' +
			escapeHtml(to.name) +
			',<br>you have confirmed your new password.<br><br>You can now log in at:<br> ' +
			htmlLink(linkReset) +
			'<br><br>The Team' +
			FALLBACK_FOOTER
	}
}
