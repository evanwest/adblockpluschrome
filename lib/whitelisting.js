/*
 * This file is part of Adblock Plus <http://adblockplus.org/>,
 * Copyright (C) 2006-2014 Eyeo GmbH
 *
 * Adblock Plus is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * Adblock Plus is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Adblock Plus.  If not, see <http://www.gnu.org/licenses/>.
 */

let {defaultMatcher} = require("matcher");
let {WhitelistFilter} = require("filterClasses");

let pagesWithKeyException = new ext.PageMap();

let isWhitelisted = exports.isWhitelisted = function(url, parentUrl, type)
{
  let filter = defaultMatcher.matchesAny(
    stripFragmentFromURL(url),
    type || "DOCUMENT",
    extractHostFromURL(parentUrl || url),
    false
  );

  return (filter instanceof WhitelistFilter ? filter : null);
};

let isFrameWhitelisted = exports.isFrameWhitelisted = function(page, frame, type)
{
  let urlsWithKeyException = pagesWithKeyException.get(page);

  for (; frame != null; frame = frame.parent)
  {
    if (urlsWithKeyException && stripFragmentFromURL(frame.url) in urlsWithKeyException)
      return true;
    if (isWhitelisted(frame.url, (frame.parent || {}).url, type))
      return true;
    if(frame.temp_whitelist)
      return true;
  }

  return false;
};

//TODO: Fix this deprecated method, total rewrite probably
let isPageWhitelistedByContent = exports.isPageWhitelistedByContent = function(page)
{
  var whitelistedYTChannels  = ["UCfW_QCRY30-w3nbr71bd2pg"];
  let ytwatchregex = '/youtube\/watch/';

  if(!page.URL || !page.URL.match(ytwatchregex)){
    return false;
  }

  var channelId = (document.querySelector("[itemprop=channelId]") || {}).content;

  //this may not work on legacy browsers, use jQuery or spin own
  if(whitelistedYTChannels.indexOf(channelId) >= 0){
    return true;
  }

  return false;
};

let verifyKeyException = function(token, url, docDomain)
{
  let match = token.match(/((.*?)=*)_(.*)/);
  if (!match)
    return false;  // invalid format

  let strippedKey = match[2];
  if (!defaultMatcher.matchesByKey(url, strippedKey, docDomain))
    return false;  // unknown key

  let uri = new URI(url);
  let params = [
    uri.path,                                               // REQUEST_URI
    uri.asciiHost + (uri.port != -1 ? ":" + uri.port : ""), // HTTP_HOST
    window.navigator.userAgent                              // HTTP_USER_AGENT
  ];

  let key = match[1];
  let signature = match[3];
  return verifySignature(key, signature, params.join("\0"));
};

let recordKeyException = function(page, url)
{
  let urlsWithKeyException = pagesWithKeyException.get(page);

  if (!urlsWithKeyException)
  {
    urlsWithKeyException = {__proto__: null};
    pagesWithKeyException.set(page, urlsWithKeyException);
  }

  urlsWithKeyException[url] = null;
};

let processKeyException = exports.processKeyException = function(token, page, frame)
{
  let url = stripFragmentFromURL(frame.url);
  let docDomain = extractHostFromURL((frame.parent || frame).url);

  if (verifyKeyException(token, url, docDomain))
    recordKeyException(page, url);
};
