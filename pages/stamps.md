---
layout: post
title: 序：NPS盖章大图鉴
permalink: /stamps/
home_directory: true
home_directory_order: 3
---


<p>
本页包含了从2021年5月底开始收集盖章以来的所有“正统”NPS章。另外还有各种花样繁多的章暂且先不展示。
</p>

<p class="wide-screen-note">屏幕有点窄，用电脑看宽屏页面会更爽。</p>

盖章排序方式：<br>
<div id="stamp-sorter" class="page-sorter" aria-label="盖章排序方式">
  <button type="button" data-stamp-sort="number" class="active" aria-pressed="true">编号顺序</button>
  <button type="button" data-stamp-sort="region">地区分类</button>
  <button type="button" data-stamp-sort="type">公园分类</button>
</div>

编号顺序是依据本站点内文章的顺序，不一定是严格地按照盖章日期顺序。

{% comment %}
本页面是根据该站点内容自动生成的，只要有文章和印章图片，且编号对应即可在此显示。为确保今后添加的印章图片格式一致，工作流记录于此：
- 使用200dpi、美国信纸规格扫描国家公园护照
- 运行Codex写的代码extract_stamps.py。该代码利用OpenCV找到圆形章并裁切512px的正方形png格式图片。
- 给裁切的图重命名标号。
- 运行`magick mogrify -format webp -- *.png`得到压缩的webp格式。
另注：092、095、096、097不是用扫描仪扫的。
{% endcomment %}

{%- comment -%}
  文章的编号有两种来源：单篇文章的 idx，或其 extras 中以“编号. 名称”
  开头的条目。先找出最后一个编号，再按连续编号排版，这样未盖章的位置也
  会保持在原来的格子中。
{%- endcomment -%}
{%- assign last_index = 0 -%}
{%- for post in site.posts -%}
  {%- assign post_idx = post.idx | append: "" -%}
  {%- if post_idx contains "-" -%}
    {%- assign idx_range = post_idx | split: "-" -%}
    {%- assign post_index = idx_range[1] | plus: 0 -%}
  {%- else -%}
    {%- assign post_index = post_idx | plus: 0 -%}
  {%- endif -%}
  {%- if post_index > last_index -%}
    {%- assign last_index = post_index -%}
  {%- endif -%}
  {%- for extra in post.extras -%}
    {%- assign extra_index = extra | split: "." | first | plus: 0 -%}
    {%- if extra_index > last_index -%}
      {%- assign last_index = extra_index -%}
    {%- endif -%}
  {%- endfor -%}
{%- endfor -%}

<nav id="stamp-toc" class="stamp-toc" aria-label="盖章目录" hidden></nav>

<div id="stamp-grid" class="stamp-grid">
{%- for index in (1..last_index) -%}
  {%- assign site_name = "" -%}
  {%- assign site_url = "" -%}
  {%- assign stamp_index = index -%}
  {%- for post in site.posts -%}
    {%- assign post_idx = post.idx | append: "" -%}
    {%- if post_idx contains "-" -%}
      {%- assign idx_range = post_idx | split: "-" -%}
      {%- assign range_start = idx_range[0] | plus: 0 -%}
      {%- assign range_end = idx_range[1] | plus: 0 -%}
      {%- if index >= range_start and index <= range_end -%}
        {%- assign site_name = post.title -%}
        {%- assign site_url = post.url -%}
        {%- assign stamp_index = range_start -%}
      {%- endif -%}
    {%- else -%}
      {%- assign post_index = post_idx | plus: 0 -%}
      {%- if post_index == index and post_idx != "" -%}
        {%- assign site_name = post.title -%}
        {%- assign site_url = post.url -%}
      {%- endif -%}
    {%- endif -%}

    {%- for extra in post.extras -%}
      {%- assign extra_index = extra | split: "." | first | plus: 0 -%}
      {%- if extra_index == index -%}
        {%- assign site_name = extra | remove_first: extra_index | remove_first: "." | strip -%}
        {%- assign site_url = post.url -%}
      {%- endif -%}
    {%- endfor -%}
  {%- endfor -%}

  {%- capture stamp_number -%}{{ stamp_index | prepend: "000" | slice: -3, 3 }}{%- endcapture -%}
  {%- assign stamp_prefix = "/images/stamps/" | append: stamp_number | append: "_" -%}
  {%- assign stamp_file = nil -%}
  {%- for file in site.static_files -%}
    {%- if file.path contains stamp_prefix -%}{%- assign stamp_file = file -%}{%- break -%}{%- endif -%}
  {%- endfor -%}
  {%- assign state = "" -%}{%- assign type_one = "" -%}{%- assign type_two = "" -%}
  {%- if stamp_file -%}
    {%- assign filename_parts = stamp_file.name | split: "_" -%}
    {%- assign state = filename_parts[1] -%}
    {%- assign type_one = filename_parts[2] | remove: ".webp" -%}
    {%- assign type_two = filename_parts[3] | remove: ".webp" -%}
  {%- endif -%}
  {%- assign state_info = site.data.passport_regions.states[state] -%}
  {%- assign region_id = state_info.region | default: "unclassified" -%}
  <div class="stamp-cell" data-region-id="{{ region_id }}" data-state-code="{{ state }}" data-types="{{ type_one }}{% if type_two != "" %} {{ type_two }}{% endif %}">
    <div class="stamp-image">{%- if stamp_file -%}<img src="{{ stamp_file.path | relative_url }}" alt="第{{ stamp_index }}号国家公园盖章" loading="lazy" decoding="async">{%- endif -%}</div>
    <div class="stamp-name">
      {%- if site_url != "" -%}
        <a href="{{ site_url | relative_url }}" target="_blank" rel="noopener">{{ index }}. {{ site_name }}</a>
      {%- endif -%}
    </div>
  </div>
{%- endfor -%}
</div>

<script>
window.stampConfig = {
  typeGroups: {{ site.data.passport_regions.stamp_type_groups | jsonify }},
  regions: {{ site.data.passport_regions.regions | jsonify }},
  states: {{ site.data.passport_regions.states | jsonify }}
};
</script>
<script src="{{ '/assets/stamps-sort.js' | relative_url }}"></script>
