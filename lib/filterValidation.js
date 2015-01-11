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

let {Filter, InvalidFilter, ElemHideBase} = require("filterClasses");

function parseFilter(text, ignore_headers)
{
  text = Filter.normalize(text);
  if (!text)
    return null;

  if (text[0] == "[")
  {
    if (ignore_headers)
      return null;

    throw ext.i18n.getMessage("unexpected_filter_list_header");
  }

  let filter = Filter.fromText(text);

  if (filter instanceof InvalidFilter)
    throw filter.reason;

  if (filter instanceof ElemHideBase)
  {
    let style = document.createElement("style");
    document.documentElement.appendChild(style);
    let sheet = style.sheet;
    document.documentElement.removeChild(style);

    try
    {
      document.querySelector(filter.selector);
      sheet.insertRule(filter.selector + "{}", 0);
    }
    catch (error)
    {
      throw ext.i18n.getMessage("invalid_css_selector", "'" + filter.selector + "'");
    }
  }

  return filter;
}
exports.parseFilter = parseFilter;

function parseFilters(text, ignore_headers)
{
  let lines = text.split("\n");
  let filters = [];

  for (let i = 0; i < lines.length; i++)
  {
    let filter;
    try
    {
      filter = parseFilter(lines[i], ignore_headers);
    }
    catch (error)
    {
      throw ext.i18n.getMessage("line", (i + 1).toString()) + ": " + error;
    }

    if (filter)
      filters.push(filter);
  }

  return filters;
}
exports.parseFilters = parseFilters;
