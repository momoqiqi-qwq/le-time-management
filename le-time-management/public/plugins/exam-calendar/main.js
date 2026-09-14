/* Le时间管理 插件：考试日历（exam-calendar）
 * ⚠ 这个文件是构建产物，不要直接改。改 src/main.template.js，然后跑 tools/build.mjs。
 *
 * 数据来源：exam-collector 采集的官方公告（每条带 confirmed 与 source.url）
 * 宿主契约：见 https://momoqiqi-qwq.github.io/tidebalance/ 与源码 tidebalance/src/pluginHost.js
 */
(function () {
  "use strict";

  const DATA = {
    "schema": "exam-calendar-data/1",
    "generatedAt": "2026-09-10T11:24:10.555Z",
    "collectedForDate": "2026-09-10",
    "scope": "大学生专用国家级考试；官方公告采集，非实时数据",
    "stats": {
      "total": 77,
      "confirmed": 71,
      "estimated": 6,
      "mergedTicketRows": 10
    },
    "events": [
      {
        "examId": "tem4",
        "name": "英语专业四级考试（TEM4）",
        "type": "written",
        "typeName": "笔试",
        "category": "英语专业",
        "date": "2022-10-30",
        "endDate": "2022-10-30",
        "confirmed": true,
        "url": "http://tem.fltonline.cn/?p=75440",
        "publishedAt": "2021-11-24",
        "cycle": 2022,
        "startTime": "8:30",
        "endTime": "10:40"
      },
      {
        "examId": "tem8",
        "name": "英语专业八级考试（TEM8）",
        "type": "written",
        "typeName": "笔试",
        "category": "英语专业",
        "date": "2022-11-19",
        "endDate": "2022-11-19",
        "confirmed": true,
        "url": "http://tem.fltonline.cn/?p=75440",
        "publishedAt": "2021-11-24",
        "cycle": 2022,
        "startTime": "8:30",
        "endTime": "11:00"
      },
      {
        "examId": "ncre",
        "name": "全国计算机等级考试（NCRE）",
        "type": "written",
        "typeName": "笔试",
        "category": "计算机",
        "date": "2023-03-25",
        "endDate": "2023-03-27",
        "confirmed": true,
        "url": "https://ncre.neea.edu.cn/html1/report/2302/226-1.htm",
        "publishedAt": "2023-02-15",
        "cycle": 2023
      },
      {
        "examId": "tem8",
        "name": "英语专业八级考试（TEM8）",
        "type": "written",
        "typeName": "笔试",
        "category": "英语专业",
        "date": "2023-04-22",
        "endDate": "2023-04-22",
        "confirmed": true,
        "url": "http://tem.fltonline.cn/?p=75508",
        "publishedAt": "2023-02-15",
        "cycle": 2023,
        "startTime": "8:30",
        "endTime": "11:00"
      },
      {
        "examId": "cet-set4",
        "name": "英语四级口语考试（CET-SET4）",
        "type": "oral",
        "typeName": "口试",
        "category": "外语",
        "date": "2023-05-20",
        "endDate": "2023-05-20",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2303/329-1.htm",
        "publishedAt": "2023-03-27",
        "cycle": 2023
      },
      {
        "examId": "cet-set6",
        "name": "英语六级口语考试（CET-SET6）",
        "type": "oral",
        "typeName": "口试",
        "category": "外语",
        "date": "2023-05-21",
        "endDate": "2023-05-21",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2303/329-1.htm",
        "publishedAt": "2023-03-27",
        "cycle": 2023
      },
      {
        "examId": "ncre",
        "name": "全国计算机等级考试（NCRE）",
        "type": "written",
        "typeName": "笔试",
        "category": "计算机",
        "date": "2023-05-27",
        "endDate": "2023-05-28",
        "confirmed": true,
        "url": "https://ncre.neea.edu.cn/html1/report/2302/226-1.htm",
        "publishedAt": "2023-02-15",
        "cycle": 2023
      },
      {
        "examId": "cet4",
        "name": "全国大学英语四级考试（CET4）",
        "type": "written",
        "typeName": "笔试",
        "category": "外语",
        "date": "2023-06-17",
        "endDate": "2023-06-17",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2303/329-1.htm",
        "publishedAt": "2023-03-27",
        "cycle": 2023
      },
      {
        "examId": "cet6",
        "name": "全国大学英语六级考试（CET6）",
        "type": "written",
        "typeName": "笔试",
        "category": "外语",
        "date": "2023-06-17",
        "endDate": "2023-06-17",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2303/329-1.htm",
        "publishedAt": "2023-03-27",
        "cycle": 2023
      },
      {
        "examId": "tem4",
        "name": "英语专业四级考试（TEM4）",
        "type": "written",
        "typeName": "笔试",
        "category": "英语专业",
        "date": "2023-06-18",
        "endDate": "2023-06-18",
        "confirmed": true,
        "url": "http://tem.fltonline.cn/?p=75508",
        "publishedAt": "2023-02-15",
        "cycle": 2023,
        "startTime": "8:30",
        "endTime": "10:40"
      },
      {
        "examId": "ncre",
        "name": "全国计算机等级考试（NCRE）",
        "type": "written",
        "typeName": "笔试",
        "category": "计算机",
        "date": "2023-09-23",
        "endDate": "2023-09-25",
        "confirmed": true,
        "url": "https://ncre.neea.edu.cn/html1/report/2306/333-1.htm",
        "publishedAt": "2023-06-19",
        "cycle": 2023
      },
      {
        "examId": "cet-set4",
        "name": "英语四级口语考试（CET-SET4）",
        "type": "oral",
        "typeName": "口试",
        "category": "外语",
        "date": "2023-11-18",
        "endDate": "2023-11-18",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2309/7-1.htm",
        "publishedAt": "2023-09-01",
        "cycle": 2023
      },
      {
        "examId": "cet-set6",
        "name": "英语六级口语考试（CET-SET6）",
        "type": "oral",
        "typeName": "口试",
        "category": "外语",
        "date": "2023-11-19",
        "endDate": "2023-11-19",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2309/7-1.htm",
        "publishedAt": "2023-09-01",
        "cycle": 2023
      },
      {
        "examId": "ncre",
        "name": "全国计算机等级考试（NCRE）",
        "type": "written",
        "typeName": "笔试",
        "category": "计算机",
        "date": "2023-12-02",
        "endDate": "2023-12-03",
        "confirmed": true,
        "url": "https://ncre.neea.edu.cn/html1/report/2302/226-1.htm",
        "publishedAt": "2023-02-15",
        "cycle": 2023
      },
      {
        "examId": "cet4",
        "name": "全国大学英语四级考试（CET4）",
        "type": "written",
        "typeName": "笔试",
        "category": "外语",
        "date": "2023-12-16",
        "endDate": "2023-12-16",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2309/7-1.htm",
        "publishedAt": "2023-09-01",
        "cycle": 2023
      },
      {
        "examId": "cet6",
        "name": "全国大学英语六级考试（CET6）",
        "type": "written",
        "typeName": "笔试",
        "category": "外语",
        "date": "2023-12-16",
        "endDate": "2023-12-16",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2309/7-1.htm",
        "publishedAt": "2023-09-01",
        "cycle": 2023
      },
      {
        "examId": "ncre",
        "name": "全国计算机等级考试（NCRE）",
        "type": "written",
        "typeName": "笔试",
        "category": "计算机",
        "date": "2024-03-23",
        "endDate": "2024-03-25",
        "confirmed": true,
        "url": "https://ncre.neea.edu.cn/html1/report/2312/255-1.htm",
        "publishedAt": "2023-12-28",
        "cycle": 2024
      },
      {
        "examId": "tem8",
        "name": "英语专业八级考试（TEM8）",
        "type": "written",
        "typeName": "笔试",
        "category": "英语专业",
        "date": "2024-04-13",
        "endDate": "2024-04-13",
        "confirmed": true,
        "url": "http://tem.fltonline.cn/?p=75519",
        "publishedAt": "2023-11-13",
        "cycle": 2024,
        "startTime": "8:30",
        "endTime": "11:00"
      },
      {
        "examId": "cet-set4",
        "name": "英语四级口语考试（CET-SET4）",
        "type": "oral",
        "typeName": "口试",
        "category": "外语",
        "date": "2024-05-18",
        "endDate": "2024-05-18",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2403/75-1.htm",
        "publishedAt": "2024-03-08",
        "cycle": 2024
      },
      {
        "examId": "cet-set6",
        "name": "英语六级口语考试（CET-SET6）",
        "type": "oral",
        "typeName": "口试",
        "category": "外语",
        "date": "2024-05-19",
        "endDate": "2024-05-19",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2403/75-1.htm",
        "publishedAt": "2024-03-08",
        "cycle": 2024
      },
      {
        "examId": "cet4",
        "name": "全国大学英语四级考试（CET4）",
        "type": "written",
        "typeName": "笔试",
        "category": "外语",
        "date": "2024-06-15",
        "endDate": "2024-06-15",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2403/75-1.htm",
        "publishedAt": "2024-03-08",
        "cycle": 2024,
        "startTime": "9:00",
        "endTime": "11:20"
      },
      {
        "examId": "cet6",
        "name": "全国大学英语六级考试（CET6）",
        "type": "written",
        "typeName": "笔试",
        "category": "外语",
        "date": "2024-06-15",
        "endDate": "2024-06-15",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2403/75-1.htm",
        "publishedAt": "2024-03-08",
        "cycle": 2024,
        "startTime": "15:00",
        "endTime": "17:25"
      },
      {
        "examId": "tem4",
        "name": "英语专业四级考试（TEM4）",
        "type": "written",
        "typeName": "笔试",
        "category": "英语专业",
        "date": "2024-06-16",
        "endDate": "2024-06-16",
        "confirmed": true,
        "url": "http://tem.fltonline.cn/?p=75519",
        "publishedAt": "2023-11-13",
        "cycle": 2024,
        "startTime": "8:30",
        "endTime": "10:40"
      },
      {
        "examId": "ncre",
        "name": "全国计算机等级考试（NCRE）",
        "type": "written",
        "typeName": "笔试",
        "category": "计算机",
        "date": "2024-09-21",
        "endDate": "2024-09-23",
        "confirmed": true,
        "url": "https://ncre.neea.edu.cn/html1/report/2406/444-1.htm",
        "publishedAt": "2024-06-25",
        "cycle": 2024
      },
      {
        "examId": "tem8",
        "name": "英语专业八级考试（TEM8）",
        "type": "registration",
        "typeName": "报名",
        "category": "英语专业",
        "date": "2024-11-11",
        "endDate": "2024-12-10",
        "confirmed": true,
        "url": "http://tem.fltonline.cn/?p=75527",
        "publishedAt": "2024-11-15",
        "cycle": 2024
      },
      {
        "examId": "2024-11-12|大学英语四六级口试",
        "name": "大学英语四六级口试准考证打印",
        "type": "ticket-print",
        "typeName": "准考证打印",
        "category": "外语",
        "date": "2024-11-12",
        "endDate": "2024-11-12",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2409/8-1.htm",
        "publishedAt": "2024-09-05",
        "cycle": 2024,
        "mergedFrom": [
          "cet-set4",
          "cet-set6"
        ]
      },
      {
        "examId": "cet-set4",
        "name": "英语四级口语考试（CET-SET4）",
        "type": "oral",
        "typeName": "口试",
        "category": "外语",
        "date": "2024-11-23",
        "endDate": "2024-11-23",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2409/8-1.htm",
        "publishedAt": "2024-09-05",
        "cycle": 2024
      },
      {
        "examId": "cet-set6",
        "name": "英语六级口语考试（CET-SET6）",
        "type": "oral",
        "typeName": "口试",
        "category": "外语",
        "date": "2024-11-24",
        "endDate": "2024-11-24",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2409/8-1.htm",
        "publishedAt": "2024-09-05",
        "cycle": 2024
      },
      {
        "examId": "2024-12-06|大学英语四六级笔试",
        "name": "大学英语四六级笔试准考证打印",
        "type": "ticket-print",
        "typeName": "准考证打印",
        "category": "外语",
        "date": "2024-12-06",
        "endDate": "2024-12-06",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2409/8-1.htm",
        "publishedAt": "2024-09-05",
        "cycle": 2024,
        "mergedFrom": [
          "cet4",
          "cet6"
        ]
      },
      {
        "examId": "cet4",
        "name": "全国大学英语四级考试（CET4）",
        "type": "written",
        "typeName": "笔试",
        "category": "外语",
        "date": "2024-12-14",
        "endDate": "2024-12-14",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2409/8-1.htm",
        "publishedAt": "2024-09-05",
        "cycle": 2024
      },
      {
        "examId": "cet6",
        "name": "全国大学英语六级考试（CET6）",
        "type": "written",
        "typeName": "笔试",
        "category": "外语",
        "date": "2024-12-14",
        "endDate": "2024-12-14",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2409/8-1.htm",
        "publishedAt": "2024-09-05",
        "cycle": 2024
      },
      {
        "examId": "ncre",
        "name": "全国计算机等级考试（NCRE）",
        "type": "written",
        "typeName": "笔试",
        "category": "计算机",
        "date": "2025-03-29",
        "endDate": "2025-03-31",
        "confirmed": true,
        "url": "https://ncre.neea.edu.cn/html1/report/2412/138-1.htm",
        "publishedAt": "2024-12-25",
        "cycle": 2025
      },
      {
        "examId": "tem8",
        "name": "英语专业八级考试（TEM8）",
        "type": "written",
        "typeName": "笔试",
        "category": "英语专业",
        "date": "2025-03-29",
        "endDate": "2025-03-29",
        "confirmed": true,
        "url": "http://tem.fltonline.cn/?p=75527",
        "publishedAt": "2024-11-15",
        "cycle": 2025,
        "startTime": "8:30",
        "endTime": "11:00"
      },
      {
        "examId": "2025-05-20|大学英语四六级口试",
        "name": "大学英语四六级口试准考证打印",
        "type": "ticket-print",
        "typeName": "准考证打印",
        "category": "外语",
        "date": "2025-05-20",
        "endDate": "2025-05-20",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2503/19-1.htm",
        "publishedAt": "2025-03-07",
        "cycle": 2025,
        "mergedFrom": [
          "cet-set4",
          "cet-set6"
        ]
      },
      {
        "examId": "cet-set4",
        "name": "英语四级口语考试（CET-SET4）",
        "type": "oral",
        "typeName": "口试",
        "category": "外语",
        "date": "2025-05-24",
        "endDate": "2025-05-24",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2503/19-1.htm",
        "publishedAt": "2025-03-07",
        "cycle": 2025
      },
      {
        "examId": "cet-set6",
        "name": "英语六级口语考试（CET-SET6）",
        "type": "oral",
        "typeName": "口试",
        "category": "外语",
        "date": "2025-05-25",
        "endDate": "2025-05-25",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2503/19-1.htm",
        "publishedAt": "2025-03-07",
        "cycle": 2025
      },
      {
        "examId": "2025-06-06|大学英语四六级笔试",
        "name": "大学英语四六级笔试准考证打印",
        "type": "ticket-print",
        "typeName": "准考证打印",
        "category": "外语",
        "date": "2025-06-06",
        "endDate": "2025-06-06",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2503/19-1.htm",
        "publishedAt": "2025-03-07",
        "cycle": 2025,
        "mergedFrom": [
          "cet4",
          "cet6"
        ]
      },
      {
        "examId": "cet4",
        "name": "全国大学英语四级考试（CET4）",
        "type": "written",
        "typeName": "笔试",
        "category": "外语",
        "date": "2025-06-14",
        "endDate": "2025-06-14",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2503/19-1.htm",
        "publishedAt": "2025-03-07",
        "cycle": 2025,
        "startTime": "9:00",
        "endTime": "11:20"
      },
      {
        "examId": "cet6",
        "name": "全国大学英语六级考试（CET6）",
        "type": "written",
        "typeName": "笔试",
        "category": "外语",
        "date": "2025-06-14",
        "endDate": "2025-06-14",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2503/19-1.htm",
        "publishedAt": "2025-03-07",
        "cycle": 2025,
        "startTime": "15:00",
        "endTime": "17:25"
      },
      {
        "examId": "tem4",
        "name": "英语专业四级考试（TEM4）",
        "type": "written",
        "typeName": "笔试",
        "category": "英语专业",
        "date": "2025-06-15",
        "endDate": "2025-06-15",
        "confirmed": true,
        "url": "http://tem.fltonline.cn/?p=75527",
        "publishedAt": "2024-11-15",
        "cycle": 2025,
        "startTime": "8:30",
        "endTime": "10:40"
      },
      {
        "examId": "ncre",
        "name": "全国计算机等级考试（NCRE）",
        "type": "written",
        "typeName": "笔试",
        "category": "计算机",
        "date": "2025-09-20",
        "endDate": "2025-09-22",
        "confirmed": true,
        "url": "https://ncre.neea.edu.cn/html1/report/2506/16-1.htm",
        "publishedAt": "2025-06-25",
        "cycle": 2025
      },
      {
        "examId": "kaoyan",
        "name": "全国硕士研究生招生考试（初试）",
        "type": "pre-registration",
        "typeName": "预报名",
        "category": "升学",
        "date": "2025-10-10",
        "endDate": "2025-10-13",
        "confirmed": true,
        "url": "https://yz.chsi.com.cn/kyzx/jybzc/202509/20250924/2293432108.html",
        "publishedAt": "2025年09月24日",
        "cycle": 2026
      },
      {
        "examId": "kaoyan",
        "name": "全国硕士研究生招生考试（初试）",
        "type": "registration",
        "typeName": "报名",
        "category": "升学",
        "date": "2025-10-16",
        "endDate": "2025-10-27",
        "confirmed": true,
        "url": "https://yz.chsi.com.cn/kyzx/jybzc/202509/20250924/2293432108.html",
        "publishedAt": "2025年09月24日",
        "cycle": 2026
      },
      {
        "examId": "tem8",
        "name": "英语专业八级考试（TEM8）",
        "type": "registration",
        "typeName": "报名",
        "category": "英语专业",
        "date": "2025-11-01",
        "endDate": "2025-12-10",
        "confirmed": true,
        "url": "http://tem.fltonline.cn/?p=75535",
        "publishedAt": "2025-11-07",
        "cycle": 2025
      },
      {
        "examId": "2025-11-18|大学英语四六级口试",
        "name": "大学英语四六级口试准考证打印",
        "type": "ticket-print",
        "typeName": "准考证打印",
        "category": "外语",
        "date": "2025-11-18",
        "endDate": "2025-11-18",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2509/26-1.htm",
        "publishedAt": "2025-09-08",
        "cycle": 2025,
        "mergedFrom": [
          "cet-set4",
          "cet-set6"
        ]
      },
      {
        "examId": "cet-set4",
        "name": "英语四级口语考试（CET-SET4）",
        "type": "oral",
        "typeName": "口试",
        "category": "外语",
        "date": "2025-11-22",
        "endDate": "2025-11-22",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2509/26-1.htm",
        "publishedAt": "2025-09-08",
        "cycle": 2025
      },
      {
        "examId": "cet-set6",
        "name": "英语六级口语考试（CET-SET6）",
        "type": "oral",
        "typeName": "口试",
        "category": "外语",
        "date": "2025-11-23",
        "endDate": "2025-11-23",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2509/26-1.htm",
        "publishedAt": "2025-09-08",
        "cycle": 2025
      },
      {
        "examId": "2025-12-05|大学英语四六级笔试",
        "name": "大学英语四六级笔试准考证打印",
        "type": "ticket-print",
        "typeName": "准考证打印",
        "category": "外语",
        "date": "2025-12-05",
        "endDate": "2025-12-05",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2509/26-1.htm",
        "publishedAt": "2025-09-08",
        "cycle": 2025,
        "mergedFrom": [
          "cet4",
          "cet6"
        ]
      },
      {
        "examId": "cet4",
        "name": "全国大学英语四级考试（CET4）",
        "type": "written",
        "typeName": "笔试",
        "category": "外语",
        "date": "2025-12-13",
        "endDate": "2025-12-13",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2509/26-1.htm",
        "publishedAt": "2025-09-08",
        "cycle": 2025,
        "startTime": "9:00",
        "endTime": "11:20"
      },
      {
        "examId": "cet6",
        "name": "全国大学英语六级考试（CET6）",
        "type": "written",
        "typeName": "笔试",
        "category": "外语",
        "date": "2025-12-13",
        "endDate": "2025-12-13",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2509/26-1.htm",
        "publishedAt": "2025-09-08",
        "cycle": 2025,
        "startTime": "15:00",
        "endTime": "17:25"
      },
      {
        "examId": "kaoyan",
        "name": "全国硕士研究生招生考试（初试）",
        "type": "written",
        "typeName": "笔试",
        "category": "升学",
        "date": "2025-12-20",
        "endDate": "2025-12-21",
        "confirmed": true,
        "url": "https://yz.chsi.com.cn/kyzx/jybzc/202509/20250924/2293432108.html",
        "publishedAt": "2025年09月24日",
        "cycle": 2026
      },
      {
        "examId": "ntce",
        "name": "中小学教师资格考试（NTCE）",
        "type": "written",
        "typeName": "笔试",
        "category": "教师资格",
        "date": "2026-03-07",
        "endDate": "2026-03-07",
        "confirmed": true,
        "url": "https://ntce.neea.cn/xhtml1/folder/1507/1260-1.htm",
        "publishedAt": null,
        "cycle": 2026
      },
      {
        "examId": "tem8",
        "name": "英语专业八级考试（TEM8）",
        "type": "written",
        "typeName": "笔试",
        "category": "英语专业",
        "date": "2026-03-21",
        "endDate": "2026-03-21",
        "confirmed": true,
        "url": "http://tem.fltonline.cn/?p=75535",
        "publishedAt": "2025-11-07",
        "cycle": 2026,
        "startTime": "8:30",
        "endTime": "11:00"
      },
      {
        "examId": "ncre",
        "name": "全国计算机等级考试（NCRE）",
        "type": "written",
        "typeName": "笔试",
        "category": "计算机",
        "date": "2026-03-28",
        "endDate": "2026-03-30",
        "confirmed": true,
        "url": "https://ncre.neea.edu.cn/html1/report/2512/40-1.htm",
        "publishedAt": "2025-12-25",
        "cycle": 2026
      },
      {
        "examId": "ntce",
        "name": "中小学教师资格考试（NTCE）",
        "type": "interview",
        "typeName": "面试",
        "category": "教师资格",
        "date": "2026-05-16",
        "endDate": "2026-05-17",
        "confirmed": true,
        "url": "https://ntce.neea.cn/xhtml1/folder/1507/1260-1.htm",
        "publishedAt": null,
        "cycle": 2026
      },
      {
        "examId": "2026-05-19|大学英语四六级口试",
        "name": "大学英语四六级口试准考证打印",
        "type": "ticket-print",
        "typeName": "准考证打印",
        "category": "外语",
        "date": "2026-05-19",
        "endDate": "2026-05-19",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2603/2-1.htm",
        "publishedAt": "2026-03-06",
        "cycle": 2026,
        "mergedFrom": [
          "cet-set4",
          "cet-set6"
        ]
      },
      {
        "examId": "cet-set4",
        "name": "英语四级口语考试（CET-SET4）",
        "type": "oral",
        "typeName": "口试",
        "category": "外语",
        "date": "2026-05-23",
        "endDate": "2026-05-23",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2603/2-1.htm",
        "publishedAt": "2026-03-06",
        "cycle": 2026
      },
      {
        "examId": "cet-set6",
        "name": "英语六级口语考试（CET-SET6）",
        "type": "oral",
        "typeName": "口试",
        "category": "外语",
        "date": "2026-05-24",
        "endDate": "2026-05-24",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2603/2-1.htm",
        "publishedAt": "2026-03-06",
        "cycle": 2026
      },
      {
        "examId": "2026-06-05|大学英语四六级笔试",
        "name": "大学英语四六级笔试准考证打印",
        "type": "ticket-print",
        "typeName": "准考证打印",
        "category": "外语",
        "date": "2026-06-05",
        "endDate": "2026-06-05",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2603/2-1.htm",
        "publishedAt": "2026-03-06",
        "cycle": 2026,
        "mergedFrom": [
          "cet4",
          "cet6"
        ]
      },
      {
        "examId": "cet4",
        "name": "全国大学英语四级考试（CET4）",
        "type": "written",
        "typeName": "笔试",
        "category": "外语",
        "date": "2026-06-13",
        "endDate": "2026-06-13",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2603/2-1.htm",
        "publishedAt": "2026-03-06",
        "cycle": 2026,
        "startTime": "9:00",
        "endTime": "11:20"
      },
      {
        "examId": "cet6",
        "name": "全国大学英语六级考试（CET6）",
        "type": "written",
        "typeName": "笔试",
        "category": "外语",
        "date": "2026-06-13",
        "endDate": "2026-06-13",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2603/2-1.htm",
        "publishedAt": "2026-03-06",
        "cycle": 2026,
        "startTime": "15:00",
        "endTime": "17:25"
      },
      {
        "examId": "tem4",
        "name": "英语专业四级考试（TEM4）",
        "type": "written",
        "typeName": "笔试",
        "category": "英语专业",
        "date": "2026-06-14",
        "endDate": "2026-06-14",
        "confirmed": true,
        "url": "http://tem.fltonline.cn/?p=75535",
        "publishedAt": "2025-11-07",
        "cycle": 2026,
        "startTime": "8:30",
        "endTime": "10:40"
      },
      {
        "examId": "ntce",
        "name": "中小学教师资格考试（NTCE）",
        "type": "written",
        "typeName": "笔试",
        "category": "教师资格",
        "date": "2026-09-12",
        "endDate": "2026-09-12",
        "confirmed": true,
        "url": "https://ntce.neea.cn/xhtml1/folder/1507/1260-1.htm",
        "publishedAt": null,
        "cycle": 2026
      },
      {
        "examId": "ncre",
        "name": "全国计算机等级考试（NCRE）",
        "type": "written",
        "typeName": "笔试",
        "category": "计算机",
        "date": "2026-09-19",
        "endDate": "2026-09-21",
        "confirmed": true,
        "url": "https://ncre.neea.edu.cn/html1/report/2606/16-1.htm",
        "publishedAt": "2026-06-24",
        "cycle": 2026
      },
      {
        "examId": "2026-11-17|大学英语四六级口试",
        "name": "大学英语四六级口试准考证打印",
        "type": "ticket-print",
        "typeName": "准考证打印",
        "category": "外语",
        "date": "2026-11-17",
        "endDate": "2026-11-17",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2609/1-1.htm",
        "publishedAt": "2026-09-02",
        "cycle": 2026,
        "mergedFrom": [
          "cet-set4",
          "cet-set6"
        ]
      },
      {
        "examId": "cet-set4",
        "name": "英语四级口语考试（CET-SET4）",
        "type": "oral",
        "typeName": "口试",
        "category": "外语",
        "date": "2026-11-21",
        "endDate": "2026-11-21",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2609/1-1.htm",
        "publishedAt": "2026-09-02",
        "cycle": 2026
      },
      {
        "examId": "cet-set6",
        "name": "英语六级口语考试（CET-SET6）",
        "type": "oral",
        "typeName": "口试",
        "category": "外语",
        "date": "2026-11-22",
        "endDate": "2026-11-22",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2609/1-1.htm",
        "publishedAt": "2026-09-02",
        "cycle": 2026
      },
      {
        "examId": "2026-12-01|大学英语四六级笔试",
        "name": "大学英语四六级笔试准考证打印",
        "type": "ticket-print",
        "typeName": "准考证打印",
        "category": "外语",
        "date": "2026-12-01",
        "endDate": "2026-12-01",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2609/1-1.htm",
        "publishedAt": "2026-09-02",
        "cycle": 2026,
        "mergedFrom": [
          "cet4",
          "cet6"
        ]
      },
      {
        "examId": "ntce",
        "name": "中小学教师资格考试（NTCE）",
        "type": "interview",
        "typeName": "面试",
        "category": "教师资格",
        "date": "2026-12-05",
        "endDate": "2026-12-06",
        "confirmed": true,
        "url": "https://ntce.neea.cn/xhtml1/folder/1507/1260-1.htm",
        "publishedAt": null,
        "cycle": 2026
      },
      {
        "examId": "cet4",
        "name": "全国大学英语四级考试（CET4）",
        "type": "written",
        "typeName": "笔试",
        "category": "外语",
        "date": "2026-12-12",
        "endDate": "2026-12-12",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2609/1-1.htm",
        "publishedAt": "2026-09-02",
        "cycle": 2026,
        "startTime": "9:00",
        "endTime": "11:20"
      },
      {
        "examId": "cet6",
        "name": "全国大学英语六级考试（CET6）",
        "type": "written",
        "typeName": "笔试",
        "category": "外语",
        "date": "2026-12-12",
        "endDate": "2026-12-12",
        "confirmed": true,
        "url": "https://cet.neea.edu.cn/html1/report/2609/1-1.htm",
        "publishedAt": "2026-09-02",
        "cycle": 2026,
        "startTime": "15:00",
        "endTime": "17:25"
      },
      {
        "examId": "ncre",
        "name": "全国计算机等级考试（NCRE）",
        "type": "written",
        "typeName": "笔试",
        "category": "计算机",
        "date": "2027-03-27",
        "endDate": "2027-03-29",
        "confirmed": false,
        "url": null,
        "publishedAt": null,
        "cycle": 2027,
        "rule": "规则推算：当月最后一个周六（历史命中率 2/3，窗口 2024–2026）"
      },
      {
        "examId": "cet4",
        "name": "全国大学英语四级考试（CET4）",
        "type": "written",
        "typeName": "笔试",
        "category": "外语",
        "date": "2027-06-12",
        "endDate": "2027-06-12",
        "confirmed": false,
        "url": null,
        "publishedAt": null,
        "cycle": 2027,
        "rule": "规则推算：当月第 2 个周六（历史命中率 5/8，窗口 2023H1–2026H2）"
      },
      {
        "examId": "cet6",
        "name": "全国大学英语六级考试（CET6）",
        "type": "written",
        "typeName": "笔试",
        "category": "外语",
        "date": "2027-06-12",
        "endDate": "2027-06-12",
        "confirmed": false,
        "url": null,
        "publishedAt": null,
        "cycle": 2027,
        "rule": "规则推算：当月第 2 个周六（历史命中率 5/8，窗口 2023H1–2026H2）"
      },
      {
        "examId": "ncre",
        "name": "全国计算机等级考试（NCRE）",
        "type": "written",
        "typeName": "笔试",
        "category": "计算机",
        "date": "2027-09-18",
        "endDate": "2027-09-20",
        "confirmed": false,
        "url": null,
        "publishedAt": null,
        "cycle": 2027,
        "rule": "规则推算：当月第 3 个周六（历史命中率 3/3，窗口 2024–2026）"
      },
      {
        "examId": "cet4",
        "name": "全国大学英语四级考试（CET4）",
        "type": "written",
        "typeName": "笔试",
        "category": "外语",
        "date": "2027-12-11",
        "endDate": "2027-12-11",
        "confirmed": false,
        "url": null,
        "publishedAt": null,
        "cycle": 2027,
        "rule": "规则推算：当月第 2 个周六（历史命中率 5/8，窗口 2023H1–2026H2）"
      },
      {
        "examId": "cet6",
        "name": "全国大学英语六级考试（CET6）",
        "type": "written",
        "typeName": "笔试",
        "category": "外语",
        "date": "2027-12-11",
        "endDate": "2027-12-11",
        "confirmed": false,
        "url": null,
        "publishedAt": null,
        "cycle": 2027,
        "rule": "规则推算：当月第 2 个周六（历史命中率 5/8，窗口 2023H1–2026H2）"
      }
    ]
  };

  /* ── 常量与全局句柄 ──
   * 关键：setInterval 的句柄必须挂到全局。宿主「重新扫描」时旧闭包不会被销毁，
   * 新闭包的局部变量是全新的 null，clearInterval 清不掉上一轮的定时器 → 两条轮询。
   * 手册里的「幂等启动模板」用的正是局部变量，跨重扫防不住，这里必须上全局。 */
  const G = typeof window !== "undefined" ? window : globalThis;
  const TIMER_KEY = "__tideExamCalendarTimer";
  const STYLE_ID = "exam-calendar-style";
  const TICK_MS = 10 * 60 * 1000; // 10 分钟一次，克制轮询
  const REMIND_DAYS = [7, 3, 1, 0]; // 考前 N 天提醒（0=当天）
  const DEFAULTS = { leadDays: 7, onlyConfirmed: false, examFilter: "all" };
  const EXAM_FILTERS = [
    { id: "all", label: "全部考试" },
    { id: "cet4", label: "大学英语四级（CET4）" },
    { id: "cet6", label: "大学英语六级（CET6）" },
    { id: "ncre", label: "全国计算机等级考试（NCRE）" },
    { id: "ntce", label: "中小学教师资格考试（NTCE）" },
    { id: "kaoyan", label: "全国硕士研究生招生考试" },
    { id: "tem4", label: "英语专业四级（TEM4）" },
    { id: "tem8", label: "英语专业八级（TEM8）" },
  ];
  const CET_SIGNUP_URL = "https://cet-bm.neea.edu.cn/";

  const WEEKDAY = "日一二三四五六";

  /* ── 时间工具（不自己拼字符串，统一用 host 的 mmOf/hhmmOf）── */
  function toUTC(dateStr) {
    const [y, m, d] = String(dateStr).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  }
  function dayDiff(fromStr, toStr) {
    return Math.round((toUTC(toStr) - toUTC(fromStr)) / 86400000);
  }
  function weekdayOf(dateStr) {
    const [y, m, d] = String(dateStr).split("-").map(Number);
    return WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  }
  function fmtDate(dateStr) {
    return dateStr + " 周" + weekdayOf(dateStr);
  }
  function countdownText(days) {
    if (days === 0) return "今天";
    if (days === 1) return "明天";
    if (days > 0) return days + " 天后";
    return Math.abs(days) + " 天前";
  }

  /* ── 数据访问 ── */
  function allEvents() {
    const list = (DATA && Array.isArray(DATA.events)) ? DATA.events : [];
    return list.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
  }
  function examFamilyIds(id) {
    if (id === "cet4") return ["cet4", "cet-set4"];
    if (id === "cet6") return ["cet6", "cet-set6"];
    return [id];
  }
  function eventBelongsToExam(e, id) {
    if (!id || id === "all") return true;
    const ids = examFamilyIds(id);
    if (ids.indexOf(e.examId) >= 0) return true;
    const merged = Array.isArray(e.mergedFrom) ? e.mergedFrom : [];
    return merged.some(function (x) { return ids.indexOf(x) >= 0; });
  }
  function filterLabel(id) {
    const hit = EXAM_FILTERS.find(function (x) { return x.id === id; });
    return hit ? hit.label : id;
  }
  function upcoming(today, opts) {
    return allEvents().filter(function (e) {
      const last = e.endDate || e.date;
      if (last < today) return false;
      if (opts && opts.onlyConfirmed && !e.confirmed) return false;
      if (opts && opts.examFilter && !eventBelongsToExam(e, opts.examFilter)) return false;
      return true;
    });
  }
  function registrationEvents(examId, today) {
    return allEvents().filter(function (e) {
      if (!eventBelongsToExam(e, examId)) return false;
      if (e.type !== "registration" && e.type !== "pre-registration") return false;
      return (e.endDate || e.date) >= today;
    });
  }
  function nextExam(today) {
    const list = upcoming(today, null);
    return list.length ? list[0] : null;
  }

  /* ── 存储（每个插件存储完全隔离；损坏数据要能兜住）── */
  async function loadSettings() {
    const raw = await tide.storage.get("settings", null);
    const s = (raw && typeof raw === "object") ? raw : {};
    return {
      leadDays: typeof s.leadDays === "number" ? s.leadDays : DEFAULTS.leadDays,
      onlyConfirmed: !!s.onlyConfirmed,
      examFilter: typeof s.examFilter === "string" && EXAM_FILTERS.some(function (x) { return x.id === s.examFilter; }) ? s.examFilter : DEFAULTS.examFilter,
    };
  }
  async function saveSettings(s) {
    await tide.storage.set("settings", s);
  }
  async function loadReminded() {
    const raw = await tide.storage.get("reminded", []);
    return Array.isArray(raw) ? raw.filter(function (k) { return typeof k === "string"; }) : [];
  }

  /* ── 样式：注入前查重，重扫不会堆 <style> ── */
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent =
      ".ecal-head{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;font-size:13px;opacity:.85}" +
      ".ecal-item{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;padding:8px 10px;border:1px solid rgba(128,128,128,.25);border-radius:10px;margin-bottom:6px}" +
      ".ecal-date{font-variant-numeric:tabular-nums;min-width:132px}" +
      ".ecal-name{font-weight:600}" +
      ".ecal-cd{margin-left:auto;font-variant-numeric:tabular-nums}" +
      ".ecal-badge{font-size:12px;padding:1px 6px;border-radius:999px;border:1px solid currentColor;opacity:.85}" +
      ".ecal-badge.est{opacity:.6}" +
      ".ecal-btn{font-size:12px;padding:3px 8px;border-radius:8px;border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;cursor:pointer}" +
      ".ecal-link{font-size:12px;opacity:.75;cursor:pointer;text-decoration:underline;background:none;border:none;color:inherit;padding:0}" +
      ".ecal-empty{opacity:.7;padding:12px 0}" +
      ".ecal-foot{margin-top:12px;font-size:12px;opacity:.6;line-height:1.7}" +
      ".ecal-year{margin:14px 2px 6px;padding-bottom:4px;border-bottom:1px dashed var(--border,#E4DFD6);font-size:12px;font-weight:700;letter-spacing:.14em;color:var(--muted,#7E8B94)}" +
      ".ecal-stale{margin:10px 0;padding:9px 12px;border:1px solid var(--border,#E4DFD6);border-left:3px solid #d9a13b;border-radius:10px;font-size:12px;color:var(--muted,#7E8B94);line-height:1.7}" +
      ".ecal-select{font-size:12px;padding:4px 26px 4px 8px;border-radius:8px;border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit}" +
      ".ecal-flow{margin:10px 0 12px;padding:12px;border:1px solid rgba(128,128,128,.28);border-radius:12px;background:rgba(128,128,128,.04)}" +
      ".ecal-flow-title{font-weight:700;margin-bottom:7px}" +
      ".ecal-flow-line{font-size:12px;line-height:1.75;opacity:.85}" +
      ".ecal-warn{margin-top:8px;padding:8px 10px;border-left:3px solid currentColor;font-size:12px;line-height:1.75;opacity:.8}";
    document.head.append(st);
  }

  /* ── 排进日程：任务 + 时间块（宿主推荐的两步写法）── */
  async function addToSchedule(ev) {
    const title = ev.name + "（" + ev.typeName + "）";
    const sameDay = await tide.blocks.list(ev.date);
    if (sameDay.some(function (b) { return b.title === title; })) {
      tide.notify("已排进 " + ev.date + " 的日程");
      return false;
    }
    const task = tide.tasks.create({
      title: title,
      note: noteOf(ev),
      quad: tide.util.guessQuad(ev.date),
      estMin: ev.type === "written" ? 150 : 60,
      tags: ["考试"],
      project: "考试日历",
      due: ev.date,
    });
    let dur = 120;
    if (ev.startTime && ev.endTime) {
      const d = tide.util.mmOf(ev.endTime) - tide.util.mmOf(ev.startTime);
      if (d > 0) dur = d;
    }
    tide.blocks.create({
      date: ev.date,
      start: ev.startTime || "09:00",
      durMin: dur,
      title: title,
      taskId: task.id,
      cat: "study",
    });
    tide.notify("已排进日程：" + fmtDate(ev.date));
    return true;
  }

  function noteOf(ev) {
    const parts = [];
    parts.push(ev.confirmed ? "官方公告已确认" : "规则推算，待官方公告确认");
    if (ev.url) parts.push(ev.url);
    return parts.join("\n");
  }

  /* ── 视图 ── */
  async function render(el) {
    el.replaceChildren(); // 幂等：每次进入视图都重建
    ensureStyle();

    const today = tide.util.today();
    const settings = await loadSettings();
    const list = upcoming(today, settings);

    const head = document.createElement("div");
    head.className = "ecal-head";

    const todayLabel = document.createElement("span");
    todayLabel.textContent = "今天 " + fmtDate(today);
    head.append(todayLabel);

    const cb = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = settings.onlyConfirmed;
    box.addEventListener("change", async function () {
      const s = await loadSettings();
      s.onlyConfirmed = box.checked;
      await saveSettings(s);
      await render(el);
    });
    cb.append(box, document.createTextNode(" 只看官方已确认"));
    head.append(cb);

    const examSelect = document.createElement("select");
    examSelect.className = "ecal-select";
    EXAM_FILTERS.forEach(function (x) {
      const op = document.createElement("option");
      op.value = x.id;
      op.textContent = x.id === "all" ? "全部考试" : "只看 · " + x.label;
      op.selected = settings.examFilter === x.id;
      examSelect.append(op);
    });
    examSelect.addEventListener("change", async function () {
      const st = await loadSettings();
      st.examFilter = examSelect.value;
      await saveSettings(st);
      await render(el);
    });
    head.append(examSelect);

    const count = document.createElement("span");
    const official = list.filter(function (e) { return e.confirmed; }).length;
    count.textContent = "共 " + list.length + " 场（官方 " + official + " / 预计 " + (list.length - official) + "）";
    head.append(count);

    if (list.length) {
      const jump = document.createElement("button");
      jump.className = "ecal-btn";
      jump.textContent = "把最近一场排进日程";
      jump.addEventListener("click", function () { void addToSchedule(list[0]); });
      head.append(jump);
    }
    el.append(head);

    // 数据陈旧提示：离线采集数据超过 90 天时明确告知，避免把过期日期当准信
    const staleDays = DATA.collectedForDate ? dayDiff(DATA.collectedForDate, today) : 0;
    if (staleDays >= 90) {
      const stale = document.createElement("div");
      stale.className = "ecal-stale";
      stale.textContent = "离线数据采集于 " + DATA.collectedForDate + "（" + staleDays + " 天前）。考试日期可能已有调整，报名与准考证信息请以官方公告和考点通知为准。";
      el.append(stale);
    }

    if (settings.examFilter !== "all") {
      const flow = document.createElement("div");
      flow.className = "ecal-flow";
      const ft = document.createElement("div");
      ft.className = "ecal-flow-title";
      ft.textContent = filterLabel(settings.examFilter) + " · 全流程";
      flow.append(ft);

      const regs = registrationEvents(settings.examFilter, today);
      const regLine = document.createElement("div");
      regLine.className = "ecal-flow-line";
      if (regs.length) {
        regLine.textContent = "已收录报名时间：" + regs.map(function (r) {
          return (r.type === "pre-registration" ? "预报名 " : "报名 ") + r.date + ((r.endDate && r.endDate !== r.date) ? " ～ " + r.endDate : "") + (r.confirmed ? "（官方）" : "（预计）");
        }).join("；");
      } else {
        regLine.textContent = "报名时间：当前离线数据尚未收录可用的全国统一报名起止时间，请以考试官网及所在学校/考点通知为准。";
      }
      flow.append(regLine);

      if (settings.examFilter === "cet4" || settings.examFilter === "cet6") {
        const warn = document.createElement("div");
        warn.className = "ecal-warn";
        warn.textContent = "CET 报名时间可能因省份、学校或考点不同而不同。请考生按所在学校规定时间登录 CET 全国网上报名系统（cet-bm.neea.edu.cn），完成资格审核、笔试报名缴费及口试报名缴费。";
        flow.append(warn);
        const signup = document.createElement("button");
        signup.className = "ecal-btn";
        signup.textContent = "打开 CET 报名系统";
        signup.addEventListener("click", function () { tide.util.openUrl(CET_SIGNUP_URL); });
        flow.append(signup);
      }
      el.append(flow);
    }

    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "ecal-empty";
      empty.textContent = settings.onlyConfirmed
        ? "没有「官方已确认」的未来考次——取消勾选可以看到规则推算的场次。"
        : "没有收录到未来的考次。";
      el.append(empty);
    }

    let lastYear = "";
    list.forEach(function (ev) {
      // 年份分组：列表常横跨两三年，按年分段更好扫读
      const year = ev.date.slice(0, 4);
      if (year !== lastYear) {
        lastYear = year;
        const yr = document.createElement("div");
        yr.className = "ecal-year";
        yr.textContent = year + " 年";
        el.append(yr);
      }
      const row = document.createElement("div");
      row.className = "ecal-item";

      const date = document.createElement("span");
      date.className = "ecal-date";
      date.textContent = fmtDate(ev.date);
      if (ev.endDate && ev.endDate !== ev.date) date.textContent += "~" + ev.endDate.slice(5);

      const name = document.createElement("span");
      name.className = "ecal-name";
      name.textContent = ev.name;
      if (ev.type !== "written") {
        const t = document.createElement("span");
        t.className = "ecal-badge";
        t.textContent = ev.typeName;
        name.append(" ", t);
      }
      if (ev.startTime) {
        const tm = document.createElement("span");
        tm.className = "ecal-badge";
        tm.textContent = ev.startTime + "-" + (ev.endTime || "");
        name.append(" ", tm);
      }

      const badge = document.createElement("span");
      badge.className = "ecal-badge" + (ev.confirmed ? "" : " est");
      badge.textContent = ev.confirmed ? "官方" : "预计";

      const cd = document.createElement("span");
      cd.className = "ecal-cd";
      cd.textContent = countdownText(dayDiff(today, ev.date));

      row.append(date, name, badge);

      if (ev.url) {
        const link = document.createElement("button");
        link.className = "ecal-link";
        link.textContent = "官方公告";
        link.addEventListener("click", function () { tide.util.openUrl(ev.url); });
        row.append(link);
      }

      const flowBtn = document.createElement("button");
      flowBtn.className = "ecal-btn";
      flowBtn.textContent = "看全流程";
      flowBtn.addEventListener("click", async function () {
        const st = await loadSettings();
        let target = ev.examId;
        if (target === "cet-set4") target = "cet4";
        if (target === "cet-set6") target = "cet6";
        if (!EXAM_FILTERS.some(function (x) { return x.id === target; })) {
          tide.notify("该项目暂不支持独立全流程筛选");
          return;
        }
        st.examFilter = target;
        await saveSettings(st);
        await render(el);
      });

      const btn = document.createElement("button");
      btn.className = "ecal-btn";
      btn.textContent = "排进日程";
      btn.addEventListener("click", function () {
        btn.disabled = true;
        void addToSchedule(ev).then(function () { btn.disabled = false; });
      });
      row.append(cd, flowBtn, btn);

      el.append(row);
    });

    const foot = document.createElement("div");
    foot.className = "ecal-foot";
    foot.textContent =
      "数据来自官方公告采集，生成于 " + (DATA.generatedAt || "未知") + "；" +
      "标注「预计」的日期由历史规律推算，可能整周偏差，仅用于倒计时。" +
      "报名、缴费、准考证一律以官方公告与考点通知为准。CET 各考点报名时间可能不同，请按所在学校通知登录 cet-bm.neea.edu.cn 完成报名缴费。";
    el.append(foot);
  }

  /* ── 任务动作：把任务的截止日设为最近一场相关考试 ── */
  const KEYWORDS = [
    { re: /六级|6级|CET6/i, ids: ["cet6"] },
    { re: /四级|4级|CET4/i, ids: ["cet4"] },
    { re: /四六级|CET/i, ids: ["cet4", "cet6"] },
    { re: /考研|研究生初试|硕士/, ids: ["kaoyan"] },
    { re: /教资|教师资格/, ids: ["ntce"] },
    { re: /计算机等级|NCRE|计算机二级/i, ids: ["ncre"] },
    { re: /专八|TEM8/i, ids: ["tem8"] },
    { re: /专四|TEM4/i, ids: ["tem4"] },
  ];

  function matchExam(title, today) {
    if (!title) return null;
    for (let i = 0; i < KEYWORDS.length; i++) {
      if (!KEYWORDS[i].re.test(title)) continue;
      const ids = KEYWORDS[i].ids;
      const hit = upcoming(today, null).filter(function (e) { return ids.indexOf(e.examId) >= 0; });
      if (hit.length) return hit[0];
    }
    return null;
  }

  /* ── 后台提醒：加载即启动；用带日期的去重键防重复推送 ── */
  async function tick() {
    const today = tide.util.today();
    const settings = await loadSettings();
    const list = upcoming(today, settings);
    const reminded = await loadReminded();
    const keep = reminded.filter(function (k) { return k.indexOf(today) >= 0; });

    for (let i = 0; i < list.length; i++) {
      const ev = list[i];
      const d = dayDiff(today, ev.date);
      if (REMIND_DAYS.indexOf(d) < 0) continue;
      const key = today + "|" + ev.examId + "|" + ev.type + "|" + d;
      if (keep.indexOf(key) >= 0) continue;
      keep.push(key);
      const when = d === 0 ? "就是今天" : "还有 " + d + " 天";
      tide.notify(ev.name + "（" + ev.typeName + "）" + when + "：" + fmtDate(ev.date) + (ev.confirmed ? "" : " · 预计"), { ms: 6000 });
      if (tide.inbox && typeof tide.inbox.create === "function") tide.inbox.create({ sourceKey: `exam:${ev.examId}:${ev.type}:${ev.date}`, title: ev.name + " · " + ev.typeName, when: ev.date, note: when + (ev.confirmed ? " · 官方已确认" : " · 预计日期，请以官方公告为准"), suggestion: "create-task" });
      tide.events.emit("exam-calendar:reminder", { examId: ev.examId, date: ev.date, days: d, confirmed: ev.confirmed });
    }
    // 只保留今天的键 + 未过期的"提前提醒"键，避免存储无限增长
    await tide.storage.set("reminded", keep.slice(-200));
  }

  function startTimer() {
    if (G[TIMER_KEY]) clearInterval(G[TIMER_KEY]); // 关键：清上一轮（可能是旧闭包的）定时器
    G[TIMER_KEY] = setInterval(function () {
      tick().catch(function (e) { console.error("[exam-calendar] tick 失败", e); });
    }, TICK_MS);
  }

  /* ── 注册 ── */
  tide.ui.registerView({
    id: "exam-calendar",
    title: "考试日历",
    icon: 'calendar-check',
    render: render,
  });

  tide.ui.registerTaskAction({
    id: "exam-calendar-set-due",
    label: "设为最近考试截止日",
    icon: "考",
    run: function (task) {
      const today = tide.util.today();
      const ev = matchExam(task && task.title, today);
      if (!ev) {
        tide.notify("标题里没匹配到已收录的考试（四六级/考研/教资/计算机等级/专四专八）");
        return;
      }
      tide.tasks.update(task.id, { due: ev.date, quad: tide.util.guessQuad(ev.date) });
      tide.notify("截止日已设为 " + ev.date + "（" + ev.name + "）");
    },
  });

  startTimer();
  tick().catch(function (e) { console.error("[exam-calendar] 首次检查失败", e); });
  tide.events.emit("exam-calendar:loaded", { events: allEvents().length, generatedAt: DATA.generatedAt || null });
})();
