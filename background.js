with(require("filterClasses"))
{
  this.Filter = Filter;
  this.RegExpFilter = RegExpFilter;
  this.BlockingFilter = BlockingFilter;
  this.WhitelistFilter = WhitelistFilter;
}
with(require("subscriptionClasses"))
{
  this.Subscription = Subscription;
  this.DownloadableSubscription = DownloadableSubscription;
}
var FilterStorage = require("filterStorage").FilterStorage;
var ElemHide = require("elemHide").ElemHide;
var defaultMatcher = require("matcher").defaultMatcher;
var Synchronizer = require("synchronizer").Synchronizer;

// Some types cannot be distinguished
RegExpFilter.typeMap.OBJECT_SUBREQUEST = RegExpFilter.typeMap.OBJECT;
RegExpFilter.typeMap.MEDIA = RegExpFilter.typeMap.FONT = RegExpFilter.typeMap.OTHER;

var isFirstRun = false;
require("filterNotifier").FilterNotifier.addListener(function(action)
{
  if (action == "load")
  {
    importOldData();
    if (!localStorage["currentVersion"])
    {
      isFirstRun = true;
      executeFirstRunActions();
    }
    localStorage["currentVersion"] = require("info").addonVersion;
  }
});

// Special-case domains for which we cannot use style-based hiding rules.
// See http://crbug.com/68705.
var noStyleRulesHosts = ["mail.google.com", "mail.yahoo.com", "www.google.com"];

// Sets options to defaults, upgrading old options from previous versions as necessary
function setDefaultOptions()
{
  function defaultOptionValue(opt, val)
  {
    if(!(opt in localStorage))
      localStorage[opt] = val;
  }

  defaultOptionValue("shouldShowIcon", "true");
  defaultOptionValue("shouldShowBlockElementMenu", "true");
  defaultOptionValue("disableInlineTextAds", "false");

  // If user had older version installed, get rid of old option
  if ("specialCaseYouTube" in localStorage)
    delete localStorage.specialCaseYouTube;
  if ("experimental" in localStorage)
    delete localStorage.experimental;
}

// Upgrade options before we do anything else.
setDefaultOptions();

/**
 * Checks whether a page is whitelisted.
 * @param {String} url
 * @param {String} [type] content type to be checked, default is "DOCUMENT"
 * @return {Filter} filter that matched the URL or null if not whitelisted
 */
function isWhitelisted(url, type)
{
  // Ignore fragment identifier
  var index = url.indexOf("#");
  if (index >= 0)
    url = url.substring(0, index);

  var result = defaultMatcher.matchesAny(url, type || "DOCUMENT", extractHostFromURL(url), false);
  return (result instanceof WhitelistFilter ? result : null);
}

// Adds or removes page action icon according to options.
function refreshIconAndContextMenu(tab)
{
  // The tab could have been closed by the time this function is called
  if(!tab)
    return;

  var excluded = isWhitelisted(tab.url);
  iconFilename = excluded ? "icons/abp-19-whitelisted.png" : "icons/abp-19.png";
  chrome.pageAction.setIcon({tabId: tab.id, path: iconFilename});

  // Only show icon for pages we can influence (http: and https:)
  if(/^https?:/.test(tab.url))
  {
    chrome.pageAction.setTitle({tabId: tab.id, title: "Adblock Plus"});
    if ("shouldShowIcon" in localStorage && localStorage["shouldShowIcon"] == "false")
      chrome.pageAction.hide(tab.id);
    else
      chrome.pageAction.show(tab.id);

    // Set context menu status according to whether current tab has whitelisted domain
    if (excluded)
      chrome.contextMenus.removeAll();
    else
      showContextMenu();
  }
}

/**
 * Old versions stored filter data in the localStorage object, this will import
 * it into FilterStorage properly.
 */
function importOldData()
{
  function addSubscription(url, title)
  {
    try
    {
      var subscription = Subscription.fromURL(url);
      if (subscription && !(subscription.url in FilterStorage.knownSubscriptions))
      {
        if (title)
          subscription.title = title;
        FilterStorage.addSubscription(subscription);
        Synchronizer.execute(subscription);
      }
    }
    catch (e)
    {
      reportError(e);
    }
  }

  // Import user-defined subscriptions
  if (typeof localStorage["userFilterURLs"] == "string")
  {
    try
    {
      var urls = JSON.parse(localStorage["userFilterURLs"]);
      for (var key in urls)
        addSubscription(urls[key]);
      delete localStorage["userFilterURLs"];
    }
    catch (e)
    {
      reportError(e);
    }
  }

  // Now import predefined subscriptions if enabled
  if (typeof localStorage["filterFilesEnabled"] == "string")
  {
    try
    {
      var subscriptions = JSON.parse(localStorage["filterFilesEnabled"]);
      if (subscriptions.korea)
        subscriptions.easylist = true;
      if (subscriptions.france)
      {
        addSubscription("https://easylist-downloads.adblockplus.org/liste_fr+easylist.txt", "Liste FR+EasyList");
        subscriptions.easylist = false;
      }
      if (subscriptions.germany)
      {
        if (subscriptions.easylist)
          addSubscription("https://easylist-downloads.adblockplus.org/easylistgermany+easylist.txt", "EasyList Germany+EasyList");
        else
          addSubscription("https://easylist-downloads.adblockplus.org/easylistgermany.txt", "EasyList Germany");
        subscriptions.easylist = false;
      }
      if (subscriptions.china)
      {
        if (subscriptions.easylist)
          addSubscription("https://easylist-downloads.adblockplus.org/chinalist+easylist.txt", "ChinaList+EasyList");
        else
          addSubscription("http://adblock-chinalist.googlecode.com/svn/trunk/adblock.txt", "ChinaList");
        subscriptions.easylist = false;
      }
      if (subscriptions.russia)
      {
        if (subscriptions.easylist)
          addSubscription("https://easylist-downloads.adblockplus.org/ruadlist+easylist.txt", "RU AdList+EasyList");
        else
          addSubscription("https://ruadlist.googlecode.com/svn/trunk/advblock.txt", "RU AdList");
        subscriptions.easylist = false;
      }
      if (subscriptions.romania)
      {
        if (subscriptions.easylist)
          addSubscription("https://easylist-downloads.adblockplus.org/rolist+easylist.txt", "ROList+EasyList");
        else
          addSubscription("http://www.zoso.ro/pages/rolist.txt", "ROList");
        subscriptions.easylist = false;
      }
      if (subscriptions.easylist)
        addSubscription("https://easylist-downloads.adblockplus.org/easylist.txt", "EasyList");
      if (subscriptions.fanboy)
        addSubscription("https://secure.fanboy.co.nz/fanboy-adblock.txt", "Fanboy's List");
      if (subscriptions.fanboy_es)
        addSubscription("https://secure.fanboy.co.nz/fanboy-espanol.txt", "Fanboy's Espa\xF1ol/Portugu\xEAs");
      if (subscriptions.italy)
        addSubscription("http://mozilla.gfsolone.com/filtri.txt", "Xfiles");
      if (subscriptions.poland)
        addSubscription("http://www.niecko.pl/adblock/adblock.txt", "PLgeneral");
      if (subscriptions.hungary)
        addSubscription("http://pete.teamlupus.hu/hufilter.txt", "hufilter");
      if (subscriptions.extras)
        addSubscription("https://easylist-downloads.adblockplus.org/chrome_supplement.txt", "Recommended filters for Google Chrome");

      delete localStorage["filterFilesEnabled"];
    }
    catch (e)
    {
      reportError(e);
    }
  }

  // Import user filters
  if(typeof localStorage["userFilters"] == "string")
  {
    try
    {
      var userFilters = JSON.parse(localStorage["userFilters"]);
      for (var i = 0; i < userFilters.length; i++)
      {
        var filterText = userFilters[i];

        // Skip useless default filters
        if (filterText == "qux.us###annoying_AdDiv" || filterText == "qux.us##.ad_class")
          continue;

        var filter = Filter.fromText(filterText);
        FilterStorage.addFilter(filter);
      }
      delete localStorage["userFilters"];
    }
    catch (e)
    {
      reportError(e);
    }
  }

  // Import "excluded domains"
  if(typeof localStorage["excludedDomains"] == "string")
  {
    try
    {
      var excludedDomains = JSON.parse(localStorage["excludedDomains"]);
      for (var domain in excludedDomains)
      {
        var filterText = "@@||" + domain + "^$document";
        var filter = Filter.fromText(filterText);
        FilterStorage.addFilter(filter);
      }
      delete localStorage["excludedDomains"];
    }
    catch (e)
    {
      reportError(e);
    }
  }

  // Delete downloaded subscription data
  try
  {
    for (var key in localStorage)
      if (/^https?:/.test(key))
        delete localStorage[key];
  }
  catch (e)
  {
    reportError(e);
  }
}

/**
 * This function is called first time the extension runs after installation.
 * It will add the default filter subscription.
 */
function executeFirstRunActions()
{
  // Don't do anything if the user has a subscription already
  var hasSubscriptions = FilterStorage.subscriptions.some(function(subscription) {return subscription instanceof DownloadableSubscription});
  if (hasSubscriptions)
    return;

  // Load subscriptions data
  var request = new XMLHttpRequest();
  request.open("GET", "subscriptions.xml");
  request.onload = function()
  {
    var subscriptions = request.responseXML.documentElement.getElementsByTagName("subscription");
    var selectedItem = null;
    var selectedPrefix = null;
    var matchCount = 0;
    for (var i = 0; i < subscriptions.length; i++)
    {
      var subscription = subscriptions[i];
      if (!selectedItem)
        selectedItem = subscription;

      var prefix = require("utils").Utils.checkLocalePrefixMatch(subscription.getAttribute("prefixes"));
      if (prefix)
      {
        if (!selectedPrefix || selectedPrefix.length < prefix.length)
        {
          selectedItem = subscription;
          selectedPrefix = prefix;
          matchCount = 1;
        }
        else if (selectedPrefix && selectedPrefix.length == prefix.length)
        {
          matchCount++;

          // If multiple items have a matching prefix of the same length:
          // Select one of the items randomly, probability should be the same
          // for all items. So we replace the previous match here with
          // probability 1/N (N being the number of matches).
          if (Math.random() * matchCount < 1)
          {
            selectedItem = subscription;
            selectedPrefix = prefix;
          }
        }
      }
    }

    var subscription = (selectedItem ? Subscription.fromURL(selectedItem.getAttribute("url")) : null);
    if (subscription)
    {
      subscription.disabled = false;
      subscription.title = selectedItem.getAttribute("title");
      subscription.homepage = selectedItem.getAttribute("homepage");
      if (subscription instanceof DownloadableSubscription && !subscription.lastDownload)
        Synchronizer.execute(subscription);
      FilterStorage.addSubscription(subscription);
    }

    subscription = Subscription.fromURL("https://easylist-downloads.adblockplus.org/chrome_supplement.txt");
    subscription.disabled = false;
    subscription.title = "Recommended filters for Google Chrome"
    if (subscription instanceof DownloadableSubscription && !subscription.lastDownload)
      Synchronizer.execute(subscription);
    FilterStorage.addSubscription(subscription);
  };
  request.send(null);
}

// Set up context menu for user selection of elements to block
function showContextMenu()
{
  chrome.contextMenus.removeAll(function()
  {
    if(typeof localStorage["shouldShowBlockElementMenu"] == "string" && localStorage["shouldShowBlockElementMenu"] == "true")
    {
      chrome.contextMenus.create({'title': chrome.i18n.getMessage('block_element'), 'contexts': ['image', 'video', 'audio'], 'onclick': function(info, tab)
      {
        if(info.srcUrl)
            chrome.tabs.sendRequest(tab.id, {reqtype: "clickhide-new-filter", filter: info.srcUrl});
      }});
    }
  });
}

/**
 * Opens Options window or focuses an existing one.
 * @param {Function} callback  function to be called with the window object of
 *                             the Options window
 */
function openOptions(callback)
{
  function findOptions(selectTab)
  {
    var views = chrome.extension.getViews({type: "tab"});
    for (var i = 0; i < views.length; i++)
      if ("startSubscriptionSelection" in views[i])
        return views[i];

    return null;
  }

  function selectOptionsTab()
  {
    chrome.windows.getAll({populate: true}, function(windows)
    {
      var url = chrome.extension.getURL("options.html");
      for (var i = 0; i < windows.length; i++)
        for (var j = 0; j < windows[i].tabs.length; j++)
          if (windows[i].tabs[j].url == url)
            chrome.tabs.update(windows[i].tabs[j].id, {selected: true});
    });
  }

  var view = findOptions();
  if (view)
  {
    selectOptionsTab();
    callback(view);
  }
  else
  {
    var onLoad = function()
    {
      var view = findOptions();
      if (view)
        callback(view);
    };

    chrome.tabs.create({url: chrome.extension.getURL("options.html")}, function(tab)
    {
      if (tab.status == "complete")
        onLoad();
      else
      {
        var id = tab.id;
        var listener = function(tabId, changeInfo, tab)
        {
          if (tabId == id && changeInfo.status == "complete")
          {
            chrome.tabs.onUpdated.removeListener(listener);
            onLoad();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      }
    });
  }
}

chrome.extension.onRequest.addListener(function(request, sender, sendResponse)
{
  switch (request.reqtype)
  {
    case "get-settings":
      var hostDomain = null;
      var selectors = null;

      // HACK: We don't know which frame sent us the message, try to find it
      // in webRequest's frame data.
      var tabId = -1;
      var frameId = -1;
      if (sender.tab)
      {
        tabId = sender.tab.id;
        if (tabId in frames)
        {
          for (var f in frames[tabId])
          {
            if (getFrameUrl(tabId, f) == request.frameUrl)
            {
              frameId = f;
              break;
            }
          }
        }
      }

      var enabled = !isFrameWhitelisted(tabId, frameId, "DOCUMENT") && !isFrameWhitelisted(tabId, frameId, "ELEMHIDE");
      if (enabled && request.selectors)
      {
        var noStyleRules = false;
        var host = extractHostFromURL(request.frameUrl);
        hostDomain = getBaseDomain(host);
        for (var i = 0; i < noStyleRulesHosts.length; i++)
        {
          var noStyleHost = noStyleRulesHosts[i];
          if (host == noStyleHost || (host.length > noStyleHost.length &&
                                      host.substr(host.length - noStyleHost.length - 1) == "." + noStyleHost))
          {
            noStyleRules = true;
          }
        }
        selectors = ElemHide.getSelectorsForDomain(host, false);
        if (noStyleRules)
        {
          selectors = selectors.filter(function(s)
          {
            return !/\[style[\^\$]?=/.test(s);
          });
        }
      }

      sendResponse({enabled: enabled, hostDomain: hostDomain, selectors: selectors});
      break;
    case "get-domain-enabled-state":
      // Returns whether this domain is in the exclusion list.
      // The page action popup asks us this.
      if(sender.tab)
      {
        sendResponse({enabled: !isWhitelisted(sender.tab.url), specialCaseYouTube: localStorage["specialCaseYouTube"] == "true", disableInlineTextAds: localStorage["disableInlineTextAds"] == "true"});
        return;
      }
      break;
    case "add-filters":
      if (request.filters && request.filters.length)
      {
        for (var i = 0; i < request.filters.length; i++)
          FilterStorage.addFilter(Filter.fromText(request.filters[i]));
      }
      break;
    case "add-subscription":
      openOptions(function(view)
      {
        view.startSubscriptionSelection(request.title, request.url);
      });
      break;
    case "forward":
      chrome.tabs.sendRequest(sender.tab.id, request.request, sendResponse);
      break;
    default:
      sendResponse({});
      break;
  }
});

// Show icon as page action for all tabs that already exist
chrome.windows.getAll({populate: true}, function(windows)
{
  for (var i = 0; i < windows.length; i++)
    for (var j = 0; j < windows[i].tabs.length; j++)
      refreshIconAndContextMenu(windows[i].tabs[j]);
});

// Update icon if a tab changes location
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab)
{
  chrome.tabs.sendRequest(tabId, {reqtype: "clickhide-deactivate"})
  if(changeInfo.status == "loading")
    refreshIconAndContextMenu(tab);
});
