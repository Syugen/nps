---
layout: post
title: 序：25美分复刻大图鉴
permalink: /quarters/
home_directory: true
home_directory_order: 3
---

美国铸币局的「美国美丽国家公园」25美分系列共56枚，每枚纪念50个州、哥伦比亚特区和5个属地的国家级地点。

复刻指数评分标准：
- ★★★★★：我觉得我不可能拍出更完美的复刻了
- ★★★★☆：模仿程度很高，但可能努努力还能更像
- ★★★☆☆：原图不可模仿（如虚构图，超特殊角度等）
- ★★☆☆☆：完全不是原图地点，但我不知道原图位置，不过拍摄图有点像
- ★☆☆☆☆：完全不是原图地点，且我知道原图位置，不过拍摄图有点像
- ☆☆☆☆☆：完全不是原图地点，拍摄图基本不相关

{% comment %}
候选图调整宽度到1600像素，并转为webp，大小不超过1MB。
```
magick mogrify \
  -format webp \
  -resize '1600x>' \
  -strip \
  -define webp:extent=1048576 \
  *.jpeg
```
{% endcomment %}

<p class="wide-screen-note">屏幕有点窄，用电脑看宽屏页面会更爽。</p>

<p class="quarters-summary" id="quarters-summary" aria-live="polite">共 56 枚</p>

<div class="quarters-grid" id="quarters-grid">
{% for quarter in site.data.quarters %}
  {% assign replica_index = quarter.replica_index | default: 0 | plus: 0 %}
  <article class="quarter-entry" data-state="{{ quarter.code }}" data-park="{{ quarter.park }}" data-state-name="{{ quarter.name }}">
    <h4>{{ quarter.name }} · {{ quarter.park }}{% if quarter.suffix %} {{ quarter.suffix }}{% endif %}<span data-replica-index hidden> · 复刻指数：{% for star in (1..5) %}{% if forloop.index <= replica_index %}★{% else %}☆{% endif %}{% endfor %}</span></h4>
    {% if quarter.note != empty %}<p>{{ quarter.note | escape }}</p>{% endif %}
    <div class="quarter-card">
      <div class="quarter-coin">
        <img src="{{ '/images/quarters/' | append: quarter.code | append: '.webp' | relative_url }}" alt="{{ quarter.park }}：{{ quarter.name }}25美分硬币反面" loading="lazy" decoding="async">
      </div>
      <div class="quarter-visit" data-visit>
        <div class="quarter-empty">
          <strong>害没去过</strong>
        </div>
      </div>
    </div>
    <hr>
  </article>
{% endfor %}
</div>

<p class="quarters-credit">硬币图：<a href="https://kids.usmint.gov/about-the-mint/america-the-beautiful-quarters" target="_blank" rel="noopener">U.S. Mint Coin Classroom</a></p>

<script>
window.quarterPhotoFiles = [
{% for file in site.static_files %}{% if file.path contains '/images/quarters/' %}
  "{{ file.path | relative_url }}",
{% endif %}{% endfor %}];
</script>
<script src="{{ '/assets/quarters-sort.js' | relative_url }}"></script>
