---
layout: post
title: 序：NPS盖章大图鉴
permalink: /stamps/
home_directory: true
home_directory_order: 3
---


<p>
本页包含了从2021年5月底开始收集盖章以来的所有“正统”NPS章。另外还有各种花样繁多的章暂且先不展示。展示顺序按照文章标号顺序，不是严格地按照盖章日期顺序。
</p>

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
{%- assign stamp_paths = site.static_files | map: "path" -%}

<table class="stamp-grid">
  <tbody>
  {%- for row_start in (1..last_index) -%}
    {%- assign row_remainder = row_start | modulo: 4 -%}
    {%- if row_remainder == 1 -%}
      <tr class="stamp-grid-images">
      {%- for offset in (0..3) -%}
        {%- assign index = row_start | plus: offset -%}
        <td{% if index > last_index %} class="stamp-grid-outside"{% endif %}>
          {%- if index <= last_index -%}
            {%- capture stamp_number -%}{{ index | prepend: "000" | slice: -3, 3 }}{%- endcapture -%}
            {%- assign stamp_path = "/images/stamps/" | append: stamp_number | append: ".webp" -%}
            <div class="stamp-image">{%- if stamp_paths contains stamp_path -%}<img src="{{ stamp_path | relative_url }}" alt="第{{ index }}号国家公园盖章" loading="lazy" decoding="async">{%- endif -%}</div>
          {%- endif -%}
        </td>
      {%- endfor -%}
      </tr>
      <tr class="stamp-grid-names">
      {%- for offset in (0..3) -%}
        {%- assign index = row_start | plus: offset -%}
        {%- assign site_name = "" -%}
        {%- assign site_url = "" -%}

        {%- if index <= last_index -%}
          {%- for post in site.posts -%}
            {%- assign post_idx = post.idx | append: "" -%}
            {%- if post_idx contains "-" -%}
              {%- assign idx_range = post_idx | split: "-" -%}
              {%- assign range_start = idx_range[0] | plus: 0 -%}
              {%- assign range_end = idx_range[1] | plus: 0 -%}
              {%- if index >= range_start and index <= range_end -%}
                {%- assign site_name = post.title -%}
                {%- assign site_url = post.url -%}
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
        {%- endif -%}

        <td{% if index > last_index %} class="stamp-grid-outside"{% endif %}>
          {%- if site_url != "" -%}
            <a href="{{ site_url | relative_url }}" target="_blank" rel="noopener">{{ index }}. {{ site_name }}</a>
          {%- endif -%}
        </td>
      {%- endfor -%}
      </tr>
    {%- endif -%}
  {%- endfor -%}
  </tbody>
</table>
