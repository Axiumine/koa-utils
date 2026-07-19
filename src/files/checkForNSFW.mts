// const Sightengine = require('sightengine')('your-api-user', 'your-api-secret');

/*
// https://sightengine.com/ but there are other services too
export async function checkForNSFW(imageUrl: string) {
	try {
    const result = await Sightengine.check(['nudity', 'wad']).set_url(imageUrl)

    if (result.nudity.safe < 0.9) {
      console.debug('NSFW content detected in the image')
      return false
    }

    console.debug('No NSFW content detected in the image')
    return true
  } catch (err) {
    console.error('Error during content moderation:', err)
    return false
  }
}
*/
