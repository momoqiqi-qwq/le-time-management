(function (root) {
  "use strict";

  const FUNCTION_CODE = "V_JWBZK_PK_XSKBZHCX";
  const FALLBACK_MENU_ID = "nrZ3d05LtXB6IN9XWB4";
  const DAY_MS = 24 * 60 * 60 * 1000;

  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  function parseDate(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const date = new Date(timestamp);
    if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) return null;
    return { timestamp, text: `${match[1]}-${match[2]}-${match[3]}` };
  }

  function mondayOf(timestamp) {
    const weekday = new Date(timestamp).getUTCDay() || 7;
    return timestamp - (weekday - 1) * DAY_MS;
  }

  function formatDate(timestamp) {
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  function sectionRange(value, duration) {
    const blocks = (String(value || "").match(/\d+/g) || [])
      .map(Number)
      .filter((number) => Number.isInteger(number) && number >= 1 && number <= 20);
    if (!blocks.length) return null;
    const firstBlock = Math.min(...blocks);
    const lastBlock = Math.max(...blocks);
    const startSection = (firstBlock - 1) * 2 + 1;
    let endSection = lastBlock * 2;
    const classHours = Number(duration);
    if (blocks.length === 1 && Number.isFinite(classHours) && classHours > 2) endSection = startSection + classHours - 1;
    return { startSection, endSection: Math.max(startSection, endSection) };
  }

  function convertRows(rawRows) {
    const prepared = (Array.isArray(rawRows) ? rawRows : []).flatMap((row) => {
      const date = parseDate(row?.SKRQ);
      const sections = sectionRange(row?.JC, row?.KXXS);
      const name = String(row?.KCMC || "").trim();
      if (!date || !sections || !name) return [];
      const day = new Date(date.timestamp).getUTCDay() || 7;
      return [{ row, date, day, sections, name }];
    });
    if (!prepared.length) throw new Error("课表页没有可识别的上课记录");

    const semesterStart = Math.min(...prepared.map((item) => mondayOf(item.date.timestamp)));
    const groups = new Map();
    let maxWeek = 1;

    for (const item of prepared) {
      const week = Math.floor((item.date.timestamp - semesterStart) / (7 * DAY_MS)) + 1;
      if (week < 1 || week > 60) continue;
      maxWeek = Math.max(maxWeek, week);
      const teacher = String(item.row.JS || "").trim();
      const position = String(item.row.DDMC || "").trim();
      const courseIdentity = String(item.row.KC_ID || item.row.KCBH || item.name).trim();
      const key = [courseIdentity, item.name, teacher, position, item.sections.startSection, item.sections.endSection, item.day].join("\u001f");
      let course = groups.get(key);
      if (!course) {
        course = {
          name: item.name,
          teacher,
          position,
          day: item.day,
          startSection: item.sections.startSection,
          endSection: item.sections.endSection,
          weeks: [],
          remark: `中国人民警察大学教务导入${item.row.XNXQ_CODE ? ` · ${item.row.XNXQ_CODE}` : ""}`,
        };
        groups.set(key, course);
      }
      if (!course.weeks.includes(week)) course.weeks.push(week);
    }

    const courses = [...groups.values()]
      .map((course) => ({ ...course, weeks: course.weeks.sort((a, b) => a - b) }))
      .filter((course) => course.weeks.length)
      .sort((a, b) => a.day - b.day || a.startSection - b.startSection || a.name.localeCompare(b.name, "zh-CN"));
    if (!courses.length) throw new Error("课表记录未能转换为课程");

    return {
      courses,
      config: {
        semesterStartDate: formatDate(semesterStart),
        semesterTotalWeeks: Math.max(20, maxWeek),
        firstDayOfWeek: 1,
      },
    };
  }

  function findCourseGrid() {
    if (!root.Ext?.ComponentQuery) return null;
    return root.Ext.ComponentQuery.query("jegridview").find((component) =>
      component?.funcData?.info?.funcCode === FUNCTION_CODE
    ) || null;
  }

  async function ensureCourseGrid() {
    let grid = findCourseGrid();
    if (grid) return grid;
    if (!root.JE) throw new Error("请先完成警大统一身份认证，进入教务首页后再导入");

    const menu = Object.values(root.JE._MENUS || {}).find((item) =>
      item?.nodeInfo === FUNCTION_CODE || item?.bean?.MENU_NODEINFO === FUNCTION_CODE
    );
    if (typeof root.JE.openFuncById === "function") root.JE.openFuncById(menu?.id || FALLBACK_MENU_ID);
    else if (typeof root.JE.showFunc === "function") root.JE.showFunc(FUNCTION_CODE, {});
    else throw new Error("当前教务页不支持打开学生课表");

    for (let attempt = 0; attempt < 40; attempt += 1) {
      await wait(500);
      grid = findCourseGrid();
      if (grid?.store) return grid;
    }
    throw new Error("学生课表加载超时，请刷新教务页后重试");
  }

  function loadAllRows(store) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) reject(new Error("完整课表加载超时"));
      }, 45000);
      store.load({
        params: { page: 1, start: 0, limit: 5000 },
        callback(records, operation, success) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (!success) {
            reject(new Error(operation?.getError?.() || "教务系统未返回课表数据"));
            return;
          }
          resolve((records || []).map((record) => record?.data || record?.raw || {}));
        },
      });
    });
  }

  async function run() {
    if (root.location?.hostname !== "jw.cppu.edu.cn") throw new Error("请在中国人民警察大学教务系统内执行导入");
    const bridge = root.shiguangBridgePromise;
    if (!bridge?.saveImportedCourses) throw new Error("课程表导入桥未就绪");
    root.shiguangBridge?.showToast?.("正在打开学生课表并读取完整学期…");
    const grid = await ensureCourseGrid();
    const rows = await loadAllRows(grid.store);
    const converted = convertRows(rows);
    await bridge.saveCourseConfig(JSON.stringify(converted.config));
    await bridge.saveImportedCourses(JSON.stringify(converted.courses));
    root.shiguangBridge?.showToast?.(`已导入 ${converted.courses.length} 门课程`);
    root.shiguangBridge?.notifyTaskCompletion?.();
    return converted;
  }

  root.CPPUCourseAdapter = { convertRows, sectionRange, run };
  if (!root.__CPPU_ADAPTER_TEST__) {
    run().catch((error) => {
      console.error("CPPU course import failed", error);
      root.shiguangBridge?.showToast?.(`警大课表导入失败：${error?.message || error}`);
    });
  }
})(window);
