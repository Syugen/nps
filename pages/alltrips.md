---
layout: post
title: 序：自驾里程排名&人生旅行全纪录表
permalink: /alltrips/
home_directory: true
home_directory_order: 1
---

默认仅显示我参与驾驶的长途公路自驾。点击“查看全部”会显示全部旅行。

<div id="trip-filter" aria-label="旅行类型筛选">
  <button type="button" data-filter="drive">只看自驾</button>
  <button type="button" data-filter="all">查看全部</button>
</div>

<div id="trip-sorter" aria-label="排序方式" data-region-order="西海岸|落地丹佛|亚利桑那合集|美国其他|世界|加州小型游|非自驾|略">
  <button type="button" data-sort="mileage-desc">里程倒序</button>
  <button type="button" data-sort="sequence-desc">时间倒序</button>
  <button type="button" data-sort="sequence-asc">时间正序</button>
  <button type="button" data-sort="region">地区分类</button>
</div>

<div id="trip-details">
  <button id="trip-details-toggle" type="button" aria-expanded="false" aria-controls="trip-details-panel">查看无聊的细节</button>
  <div id="trip-details-panel" class="trip-details-panel" aria-hidden="true">
{% capture trip_details_markdown %}
本文中的旅行条目来源于我的旅行记录表格，包含了所有被我定义为“旅行”和“出远门”的出行。关于它们的定义如下：

#### 旅行：记录条目并赋予编号

定义：该次出行本身形成了一个新的、独立的旅行体验单元。

通常满足的特征有：

- 目的地本身、环境或当地体验是这次出行的重要组成部分。
- 具有一定的新鲜感、非日常性的地域体验。对于“新鲜感”的定义，取决于当时的生活状态和既往经历。
- 主要活动是传统观光、度假、娱乐活动，或者有新鲜感的休闲出行等。
- 重复前往同一目的地时，如果已经高度模式化，则一般不再编号。
- 强烈的非娱乐性目的通常不赋予编号。

例如：专门进行城市或自然目的地游览、以度假环境本身为核心的休闲旅行、前往明显不同的环境参加一次非日常娱乐活动等。

#### 出远门：记录条目但不编号

定义：该次出行具有独立的移动或记录价值，但没有形成足够新的、独立的旅行体验。

常见原因：

- 出行主要由工作、面试、办事、医疗、签证、搬家等强非娱乐性事务驱动。
- 出行主要为了探亲、访友等人际目的，而目的地体验只是附带内容。
- 前往已经非常熟悉的目的地，整体模式与过去高度重复，只有少量新增内容，新鲜感不足以形成新的旅行单元。
- 若乘坐了飞机航班，或到访了世界遗产。

#### 其余的出行不做记录。典型的不做记录的例子有：

- 重复且几乎没有新增体验的滑雪、露营、徒步等休闲活动。
- 以朋友家过夜、聚会、吃饭或其他日常社交为主要目的的活动。

---

另外，以下是地图和里程的细节，供日后参考。

#### 对于地图的生成方式，有如下几种：

- 2018 年到 2022 年 8 月期间，我曾经使用过 Google Timeline。这期间谷歌地图自动记录我的行程，我通过 snap 到公路的方式得到路程，然后下载为 KML 文件并处理后绘制地图。
- 对于 2024 年 5 月的行程，我当时用自己开发的 app 记录了全程的 GPS 坐标，并使用生成的 GPX 文件绘制地图。
- 对于 2018 年以前，和 2022 年 11 月以后的行程，我使用 Google MyMaps 上通过回忆线路，生成导航线路，下载成 KML 文件，然后经过处理绘制地图。

#### 对于里程的计算方式，有如下几种：

- 如果能找到租车记录，则使用收据上记录的里程，标明“数据来源：AVIS”。
- 否则，利用 Haversine 公式通过地球坐标计算记录，标明“数据来源：Timeline”或“数据来源：回忆线路”等。

注：

- 对于通过 Google Timeline 得到的地图，在 KML 里有里程元数据，同时也可以利用公式。两者往往相差最多 100 千米，但本文统一使用公式结果。
- 对于通过回忆路程而生成的地图，误差结果可能会更大。
{% endcapture %}
{{ trip_details_markdown | markdownify }}
  </div>
</div>

<hr>

<div id="trip-summary" aria-live="polite"></div>

<div id="trip-list">

{% for trip in site.data.trips %}
  {% comment %}The UTF-8 BOM is retained as part of the first CSV header by the
  Jekyll reader used by this site. Keep the character below; it is intentional.
  {% endcomment %}
  {% assign sequence_key = "﻿序号" %}
  {% assign sequence = trip[sequence_key] %}
  {% assign region = trip["地区分类"] %}
  {% assign start_date = trip["开始日期"] %}
  {% assign miles = trip["里程英里"] %}
  {% assign kilometers = trip["里程公里"] %}
  {% assign is_solo = false %}
  {% if trip["独自旅行"] == "1" %}
    {% assign is_solo = true %}
  {% endif %}
  {% assign trip_type = "other" %}
  {% assign has_mileage = false %}
  {% if miles and miles != "" %}
    {% assign has_mileage = true %}
  {% endif %}
  {% if kilometers and kilometers != "" %}
    {% assign has_mileage = true %}
  {% endif %}
  {% if has_mileage %}
    {% assign trip_type = "drive" %}
  {% endif %}

  <article class="trip-entry" data-region="{{ region }}"
    data-start-date="{{ start_date | escape }}"
    data-trip-type="{{ trip_type }}"
    data-solo="{{ is_solo }}">
    <div><small>人生旅行序号：<trip-seq>{{ sequence }}</trip-seq></small></div>
    <h3>{{ trip["标题"] | escape }}</h3>

  {% if has_mileage %}
    <p>
      里程：<trip-mile>{{ miles | escape }}</trip-mile> 英里 |
      <trip-km>{{ kilometers | escape }}</trip-km> 公里
      {% if trip["里程来源"] != "" %}
        <br class="trip-mileage-source-break">
        <span class="trip-mileage-source">（数据来源：{{ trip["里程来源"] | escape }}）</span>
      {% endif %}
    </p>
  {% endif %}

  <div class="trip-entry-content">

  <!-- details: 某次旅行对应的每日行程 -->
  {% assign details = site.data.travel_details | where: sequence_key, sequence %}
  {% assign first_country = "" %}
  {% assign countries = "" | split: "," %}
  {% assign has_primary = false %}
  {% assign has_detail_date = false %}

  <!-- 旅行层面的列选择均在此处完成；CSS 仅按窄屏断点隐藏已标记的列。 -->
  {% for detail in details %}
    {% assign country = detail["国家"] %}
    {% if country != "" %}
      {% if first_country == "" %}
        {% assign first_country = country %}
      {% endif %}
      {% unless countries contains country %}
        {% assign country_as_array = country | split: "|" %}
        {% assign countries = countries | concat: country_as_array %}
      {% endunless %}
    {% endif %}
    {% if detail["日期"] != "" %}
      {% assign has_detail_date = true %}
    {% endif %}
    {% if detail["一级行政区"] != "" %}
      {% assign has_primary = true %}
    {% endif %}
  {% endfor %}

  {% assign country_count = countries | size %}
  {% assign show_country_wide = false %}
  {% if country_count > 1 %}
    {% assign show_country_wide = true %}
  {% endif %}
  {% assign show_primary_wide = has_primary %}
  <!-- 三个及以上国家（“超过三个”包括三个）时，宽屏也不显示行政区。 -->
  {% if country_count >= 3 %}
    {% assign show_primary_wide = false %}
  {% endif %}
  {% assign is_us_can_only = false %}
  <!-- 仅包含美国和加拿大时，窄屏以行政区（可缩写）替代国家列。 -->
  {% if country_count == 2 and countries contains "美国" and countries contains "加拿大" %}
    {% assign is_us_can_only = true %}
  {% endif %}
  {% assign show_country_compact = show_country_wide %}
  <!-- 单一国家旅行沿用宽屏行政区列；只有其他跨国旅行才在窄屏隐藏行政区。 -->
  {% assign show_primary_compact = show_primary_wide %}
  {% if is_us_can_only %}
    {% assign show_country_compact = false %}
  {% elsif show_country_wide %}
    {% assign show_primary_compact = false %}
  {% endif %}

  <!-- 如果找到了本次旅行的每日行程，打印表格 -->
  {% if details.size > 0 %}

  {% assign primary_heading = "行政区" %}
  {% unless show_country_wide %}
    {% case first_country %}
      {% when "中国" %}{% assign primary_heading = "省市区" %}
      {% when "日本" %}{% assign primary_heading = "都道府县" %}
      {% when "美国" %}{% assign primary_heading = "州" %}
      {% when "加拿大" %}{% assign primary_heading = "省" %}
    {% endcase %}
  {% endunless %}

  <table>
    <thead>
      <tr>
        <th scope="col">日期</th>
        {% if show_country_wide %}<th scope="col"{% unless show_country_compact %} class="trip-column-compact-hidden"{% endunless %}>国家</th>{% endif %}
        {% if show_primary_wide %}<th scope="col"{% unless show_primary_compact %} class="trip-column-compact-hidden"{% endunless %}>{{ primary_heading }}</th>{% endif %}
        <th scope="col">城市/景点</th>
      </tr>
    </thead>
    <tbody>
      {% assign matching_detail_index = 0 %}
      {% for detail in details %}
        {% assign matching_detail_index = matching_detail_index | plus: 1 %}
        {% assign city = detail["次级行政区"] | strip | replace: " (及附近)", " 附近" %}
        {% assign attraction = detail["景点"] | strip %}
        {% assign detail_date = detail["日期"] %}
        {% assign detail_country = detail["国家"] %}
        {% assign primary = detail["一级行政区"] %}
        {% assign country_abbreviations = site.data.administrative_abbreviations[detail_country] %}
        {% assign primary_short = country_abbreviations[primary] %}
        <tr>
          <td>
            {% if detail_date != "" %}
              <span class="trip-date"><span class="trip-date-year">{{ detail_date | slice: 0, 5 }}</span>{{ detail_date | slice: 5, 5 }}</span>
            {% elsif has_detail_date == false and matching_detail_index == 1 %}
              {% if trip["开始日期"] != trip["结束日期"] %}
                <span class="trip-date"><span class="trip-date-year">{{ trip["开始日期"] | slice: 0, 5 }}</span>{{ trip["开始日期"] | slice: 5, 5 }} -<br><span class="trip-date-year">{{ trip["结束日期"] | slice: 0, 5 }}</span>{{ trip["结束日期"] | slice: 5, 5 }}</span>
              {% else %}
                <span class="trip-date"><span class="trip-date-year">{{ trip["开始日期"] | slice: 0, 5 }}</span>{{ trip["开始日期"] | slice: 5, 5 }}</span>
              {% endif %}
            {% endif %}</td>
          {% if show_country_wide %}
            <td{% unless show_country_compact %} class="trip-column-compact-hidden"{% endunless %}>{{ detail["国家"] }}</td>
          {% endif %}
          {% if show_primary_wide %}
            <td{% unless show_primary_compact %} class="trip-column-compact-hidden"{% endunless %}>
              {% if primary_short and primary_short != "" %}
                <span class="trip-primary-full">{{ primary }}</span>
                <span class="trip-primary-compact">{{ primary_short }}</span>
              {% else %}
                {{ primary }}
              {% endif %}
            </td>
          {% endif %}
          <td>
            {% if city != "" and attraction != "" %}
              {{ city }}：{{ attraction }}
            {% elsif city != "" %}
              {{ city }}
            {% else %}
              {{ attraction }}
            {% endif %}
          </td>
        </tr>
      {% endfor %}
    </tbody>
  </table>

  <!-- 没有找到每日形成的情况 -->
  {% elsif sequence == "57.1" %}
    <p>这不算一次旅游，但是由于成就过于耀眼，一天去了七个地方盖章，故单列一节。</p>
  {% endif %}

  </div>

  {% comment %}关联字段为数组，允许一篇 NPS 笔记对应多次旅行序号。{% endcomment %}
  {% assign ordered_nps_posts = site.posts | sort: "order" | reverse %}
  {% assign related_nps_count = 0 %}
  {% for post in ordered_nps_posts %}
    {% if post.trip_sequences contains sequence %}
      {% assign related_nps_count = related_nps_count | plus: 1 %}
    {% endif %}
  {% endfor %}
  {% if related_nps_count > 0 %}
    <div class="trip-nps-articles">
      <p>相关 NPS 笔记：</p>
      <ul>
      {% for post in ordered_nps_posts %}
        {% if post.trip_sequences contains sequence %}
          <li>
            {% if post.idx %}{{ post.idx }}. {% endif %}<a href="{{ post.url | relative_url }}" target="_blank" rel="noopener">{{ post.title }}</a>
            {% if post.extras and post.extras.size > 0 %}
              <ul class="trip-nps-article-extras">
              {% for extra in post.extras %}
                <li>{{ extra }}</li>
              {% endfor %}
              </ul>
            {% endif %}
          </li>
        {% endif %}
      {% endfor %}
      </ul>
    </div>
  {% endif %}

  {% assign map_url = trip["地图URL"] %}
  {% if map_url and map_url != "" %}
    <div class="trip-map" data-trip-map>
      <button class="trip-map-toggle" type="button" aria-expanded="true">隐藏地图</button>
      <div class="trip-map-panel is-expanded">
        <iframe data-map-src="https://www.google.com/maps/d/embed?mid={{ map_url | escape }}&amp;ehbc=2E312F" width="100%" height="500"></iframe>
      </div>
    </div>
  {% endif %}

  <hr>
  </article>
{% endfor %}
</div>

<nav id="trip-pagination" aria-label="旅行分页"></nav>

<script src="{{ '/assets/trip-sort.js' | relative_url }}"></script>
