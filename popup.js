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

var backgroundPage = ext.backgroundPage.getWindow();
var imports = ["require", "extractHostFromURL", "openOptions"];
for (var i = 0; i < imports.length; i++)
  window[imports[i]] = backgroundPage[imports[i]];

var Filter = require("filterClasses").Filter;
var FilterStorage = require("filterStorage").FilterStorage;
var Prefs = require("prefs").Prefs;
var isWhitelisted = require("whitelisting").isWhitelisted;

var page = null;
var metadata = null;

function init()
{
  ext.pages.query({active: true, lastFocusedWindow: true}, function(pages)
  {
    page = pages[0];

    // Mark page as local to hide non-relevant elements
    if (!page || !/^https?:\/\//.test(page.url))
      document.body.classList.add("local");

    // Ask content script whether clickhide is active. If so, show cancel button.
    // If that isn't the case, ask background.html whether it has cached filters. If so,
    // ask the user whether she wants those filters.
    // Otherwise, we are in default state.
    if (page)
    {
      console.log("Got pages query back, fetching metadata");
      ext.backgroundPage.getWindow().getMetadata(function(data){
	if(data){
	  metadata = data;
	}

	var whitelistFilter = isWhitelisted(page.url, null, null, metadata);
	if (whitelistFilter)
          document.getElementById("enabled").classList.add("off")

	if((metadata || {}).ytid){
	  //this page had ytid info, show channel enable/disable button
	  document.getElementById("ytenabled").classList.remove("hidden");

	  //check for active/inactive state of channel filter
	  if(whitelistFilter && whitelistFilter.metadata && whitelistFilter.metadata.ytid){
	    document.getElementById("ytenabled").classList.add("off");
	  }
	  //else do nothing
	}
	else{
	  //has no ytid info, hide channel enable/disable buttons
	  document.getElementById("ytenabled").classList.add("hidden");
	}
      });

      page.sendMessage({type: "get-clickhide-state"}, function(response)
      {
        if (response && response.active)
          document.body.classList.add("clickhide-active");
      });
    }
  });

  // Attach event listeners
  document.getElementById("enabled").addEventListener("click", toggleEnabled, false);
  document.getElementById("ytenabled").addEventListener("click", toggleYTEnabled, false);
  document.getElementById("clickhide").addEventListener("click", activateClickHide, false);
  document.getElementById("clickhide-cancel").addEventListener("click", cancelClickHide, false);
  document.getElementById("options").addEventListener("click", function()
  {
    openOptions();
  }, false);

  // Set up collapsing of menu items
  var collapsers = document.getElementsByClassName("collapse");
  for (var i = 0; i < collapsers.length; i++)
  {
    var collapser = collapsers[i];
    collapser.addEventListener("click", toggleCollapse, false);
    if (!Prefs[collapser.dataset.option])
      document.getElementById(collapser.dataset.collapsable).classList.add("collapsed");
  }
}
window.addEventListener("DOMContentLoaded", init, false);

function toggleEnabled()
{
  var enabledButton = document.getElementById("enabled")
  var disabled = enabledButton.classList.toggle("off");
  if (disabled)
  {
    var host = extractHostFromURL(page.url).replace(/^www\./, "");
    var filter = Filter.fromText("@@||" + host + "^$document");
    if (filter.subscriptions.length && filter.disabled)
      filter.disabled = false;
    else
    {
      filter.disabled = false;
      FilterStorage.addFilter(filter);
    }
  }
  else
  {
    // Remove any exception rules applying to this URL
    var filter = isWhitelisted(page.url);
    while (filter)
    {
      FilterStorage.removeFilter(filter);
      if (filter.subscriptions.length)
        filter.disabled = true;
      filter = isWhitelisted(page.url);
    }
  }
}

function toggleYTEnabled()
{
  if(!metadata || !metadata.ytid){
    return;
  }
  
  var ytenabledButton = document.getElementById("ytenabled")
  var disabled = ytenabledButton.classList.toggle("off");
  if(disabled)
  {
    //TODO: add this channel to whitelist
    var host = extractHostFromURL(page.url).replace(/^www\./, "");
    var filter = Filter.fromText("@@||"+host+"^{{\"ytid\":\""+metadata.ytid+"\"}}$document");
    console.log("Adding channel "+metadata.ytid+" to whitelist");
    if (filter.subscriptions.length && filter.disabled)
      filter.disabled = false;
    else
    {
      filter.disabled = false;
      FilterStorage.addFilter(filter);
    }
  }
  else{
    // Remove only rules applying to this URL with metadata
    var filter = isWhitelisted(page.url, null, null, metadata);
    while (filter)
    {
      if(filter.metadata && filter.metadata.ytid){
	FilterStorage.removeFilter(filter);
 	if (filter.subscriptions.length)
          filter.disabled = true;
      }
      filter = isWhitelisted(page.url, null, null, metadata);
    }
  }
}

function activateClickHide()
{
  document.body.classList.add("clickhide-active");
  page.sendMessage({type: "clickhide-activate"});

  // Close the popup after a few seconds, so user doesn't have to
  activateClickHide.timeout = window.setTimeout(ext.closePopup, 5000);
}

function cancelClickHide()
{
  if (activateClickHide.timeout)
  {
    window.clearTimeout(activateClickHide.timeout);
    activateClickHide.timeout = null;
  }
  document.body.classList.remove("clickhide-active");
  page.sendMessage({type: "clickhide-deactivate"});
}

function toggleCollapse(event)
{
  var collapser = event.currentTarget;
  Prefs[collapser.dataset.option] = !Prefs[collapser.dataset.option];
  collapser.parentNode.classList.toggle("collapsed");
}
