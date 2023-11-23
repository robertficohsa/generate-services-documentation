import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const directory = process.argv[2];
const ENDPOINT_SEARCH_ARG = "value";
const WSDL_SEARCH_ARG = 'wsdl ref="';
const OPERATION_SEARCH_ARG = 'operation name="';
const main = async () => {
  try {
    if (!directory) {
      throw new Error("No directory path was given");
    }
    const dirContent = await fs.readdir(directory, { recursive: true });
    const proxies = dirContent.filter(
      (fileOrDir) => path.extname(fileOrDir) == ".proxy"
    );
    let servicesCount = 0;
    // await fs.writeFile("services.csv", "");
    const serviceNames: string[] = [];
    proxies.forEach(async (url) => {
      const proxyContent = await fs.readFile(path.join(directory, url), "utf8");
      let serviceName = path.basename(url, ".proxy");

      const endpointIndex = proxyContent.match(ENDPOINT_SEARCH_ARG)?.index;
      const wsdlIndex = proxyContent.match(WSDL_SEARCH_ARG)?.index;
      let endpoint = "N/A";
      let wsdl = "N/A";
      let serviceType = "";
      let version = getServiceVersion(url);
      let serviceId = getServiceId(serviceName, proxyContent);
      let country = getCountry(serviceName, proxyContent);
      const urlSegments = url.split("\\");
      const versionSegment = urlSegments[1];
      const projectName = getProjectSegment(urlSegments[0]);
      const context = getContext(
        urlSegments[versionSegment.length == 2 ? 2 : 1]
      );
      serviceName += `_v${version}${projectName}${context}`;
      if (serviceNames.includes(serviceName)) {
        serviceName += "2";
      }
      serviceNames.push(serviceName);

      const operations = new Set();
      if (wsdlIndex) {
        const wsdlSlice = proxyContent.substring(
          wsdlIndex + WSDL_SEARCH_ARG.length
        );

        const nextQuote = wsdlSlice.match('"')?.index;
        wsdl = wsdlSlice.substring(0, nextQuote) + ".wsdl";
        const wsdlPath = path.join(directory, wsdl);
        const exist = fsSync.existsSync(wsdlPath);
        if (exist) {
          const wsdlContent = await fs.readFile(wsdlPath, "utf8");
          const operationMatches = [
            ...wsdlContent.matchAll(/operation name=\"/g),
          ];
          const operationIndexes = operationMatches.map((m) => m.index!);
          if (operationIndexes) {
            operationIndexes.forEach((operationIndex) => {
              const operationSlice = wsdlContent.substring(
                operationIndex + OPERATION_SEARCH_ARG.length
              );
              const nextQuote = operationSlice.match('"')?.index;
              const operation = operationSlice.substring(0, nextQuote);
              operations.add(operation);
              serviceType =
                operations.size >= 2 ? "MasterProxyServer" : "LocalProxyServer";
            });
          }
        }
      }
      if (endpointIndex) {
        const endpointSlice = proxyContent.substring(endpointIndex);
        const openingTag = endpointSlice.match(">")!.index!;
        const nextClosingTag = endpointSlice.match("<")?.index;
        endpoint = endpointSlice.substring(openingTag + 1, nextClosingTag);
        if (endpoint.startsWith("'")) {
          endpoint = "N/A";
        }
      }
      servicesCount++;
      let description = `CREADO POR: 
MODIFICADO POR: 
REVISADO POR: 
FECHA DE REVISIÓN: 
ESTADO: Desplegado
ID SERVICIO: ${serviceId}
URL: ${endpoint == "N/A" ? url.split(".")[0] : endpoint + "?wsdl"}
ENDPOINT: ${endpoint} 
DESCRIPCION: 
OPERACIONES:  \n${[...operations].map((e) => `- ${e}`).join("\n")}
VERSIÓN: ${version}
FECHA DE DESPLIEGUE: 
TECNOLOGÍA DE DESPLIEGUE: OSB
TIPO DE MENSAJE: SOAP`;
      console.log({
        url,
        context: url.split("\\")[0][0],
        serviceName,
        endpoint,
        wsdl,
        country,
        operations,
        serviceType,
        version,
        serviceId,
        description,
      });
      // await fs.appendFile("services.csv", `${serviceName}\n`);
      await prisma.proxyServices.create({
        data: {
          serviceName,
          country,
          description,
          serviceType,
        },
      });
    });
  } catch (e) {
    console.error(e);
  }
};
const contexts = new Set();
function getContext(context: string) {
  contexts.add(context);
  if (context == "ProxyServices") {
    return "PS";
  }
  if (context == "SProxyServices") {
    return "SPS";
  }
  if (context == "ExternalServices") {
    return "ES";
  }
  if (context == "ReferenceData") {
    return "RD";
  }
  if (context == "RiskAndCompliance") {
    return "RC";
  }
  if (context == "OperationsAndExecution") {
    return "OE";
  }
  if (context == "External") {
    return "E";
  }
  return context;
}

function getCountry(service: string, proxyContent: string) {
  if (service.includes("RG")) {
    return "RG";
  }
  if (service.includes("HN")) {
    return "HN";
  }
  if (service.includes("GT")) {
    return "GT";
  }
  if (service.includes("PA")) {
    return "PA";
  }
  if (service.includes("NI")) {
    return "NI";
  }

  if (
    proxyContent.includes("HN01") &&
    proxyContent.includes("NI01") &&
    proxyContent.includes("PA01") &&
    proxyContent.includes("GT01")
  ) {
    return "RG";
  }
  if (proxyContent.includes("HN01")) {
    return "HN";
  }
  if (proxyContent.includes("GT01")) {
    return "GT";
  }
  if (proxyContent.includes("PA01")) {
    return "PA";
  }
  if (proxyContent.includes("NI01")) {
    return "NI";
  }

  return "Unknown";
}
function getServiceVersion(filePath: string) {
  if (filePath.includes("v2")) {
    return "2";
  }
  if (filePath.includes("v3")) {
    return "3";
  }
  if (filePath.includes("v4")) {
    return "4";
  }
  return "1";
}

function getServiceId(service: string, proxyContent: string) {
  const SERVICE_ID_SEARCH_ARG = 'serviceId">';
  if (proxyContent.includes(SERVICE_ID_SEARCH_ARG)) {
    const serviceIdParamIndex = proxyContent.match(SERVICE_ID_SEARCH_ARG)!
      .index!;
    const serviceIdParamSlice = proxyContent.substring(
      serviceIdParamIndex + SERVICE_ID_SEARCH_ARG.length
    );
    const nearestTag = serviceIdParamSlice.match(">")?.index!;
    const QUOTE_AND_TAG_LENGTH = '>"'.length;
    const serviceIdSlice = serviceIdParamSlice.substring(
      nearestTag + QUOTE_AND_TAG_LENGTH
    );
    // console.log({ serviceIdSlice });

    const nextTag = serviceIdSlice.match("<")?.index!;
    let serviceId = serviceIdSlice.substring(0, nextTag - '"'.length);

    if (serviceId.startsWith("A")) {
      const XQUERY_SEARCH_ARG = "xqueryText";
      const xqueryTextIndex = serviceIdSlice.match(XQUERY_SEARCH_ARG)?.index!;
      const xquerySlice = serviceIdSlice.substring(
        xqueryTextIndex + XQUERY_SEARCH_ARG.length
      );
      const closingTagIndex = xquerySlice.match("<")?.index!;
      serviceId = xquerySlice.substring(
        0 + QUOTE_AND_TAG_LENGTH,
        closingTagIndex
      );
      return serviceId;
    }
    return serviceId;
  }
  return "Unknown";
}
const projects = new Set();
function getProjectSegment(projectName: string) {
  projects.add(projectName);
  if (projectName == "Middleware") {
    return "MW";
  }
  if (projectName == "IntegrationFramework") {
    return "IF";
  }
  if (projectName == "MiddlewareCaja") {
    return "MWC";
  }
  if (projectName == "MWCaja") {
    return "MWCaja";
  }
  if (projectName == "MWHostToHost") {
    return "MWH2H";
  }
  return projectName;
}

main();
