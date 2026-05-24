
/**
 status code that do not allow body content

 100 Continue: This interim response indicates that everything so far is OK and that the client should continue with the request or ignore if it is already finished.

 101 Switching Protocols: This code is sent in response to an Upgrade request header from the client and indicates the protocol the server is switching to.

 102 Processing (WebDAV; RFC 2518): This code indicates that the server has received and is processing the request, but no response is available yet.

 204 No Content: This code indicates that the server successfully processed the request and is not returning any content.

 205 Reset Content: This code tells the client to reset the document view, such as clearing a form for new input. No response body is allowed.

 304 Not Modified: This code indicates that the resource has not been modified since the version specified by the request headers If-Modified-Since or If-None-Match. The response must not contain a message body.
*/
