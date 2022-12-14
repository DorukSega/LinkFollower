"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@octokit/core");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_process_1 = require("node:process");
const undici_1 = require("undici");
const ExListInput = "https://www.example.com\nexample.org"; //Example input
const ExConfig = '{"telegram": { "bot_token": "HERE","chat_id": 1},"filters": ["REDACTED"]}';
const LinkListPath = (0, node_path_1.join)(__dirname, process.argv.length > 2 ? process.argv[2] : "LinkList.txt"); //IF Given Enters Argument Else Defaults 
const ChecksumListPath = (0, node_path_1.join)(__dirname, "ChecksumList.json");
const HistoryPath = (0, node_path_1.join)(__dirname, "/history/");
const DiffPath = (0, node_path_1.join)(__dirname, "/diff/"); //differences
const interval = 10000;
var Config;
var ChecksumListRaw;
var ChecksumList;
var LinkList;
var GistList = new Map();
function parseLink(Link) {
    if (!Link.includes("http"))
        return "https://" + Link;
    return Link;
}
function Hash(text) {
    var hash = 0, i, chr;
    if (text.length === 0)
        return hash;
    for (i = 0; i < text.length; i++) {
        chr = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}
function escapeNegative(checksum) {
    return checksum >= 0 ? checksum.toString() : ("N" + Math.abs(checksum).toString());
}
function readHistory(Checksum, Link, RawHash, RawData) {
    let result;
    const filename = escapeNegative(Hash(Link)) + ".txt";
    (0, node_fs_1.readFile)((0, node_path_1.join)(HistoryPath, filename), 'utf8', (err, data) => {
        if (err)
            throw err;
        result = data.substring(data.indexOf("\n") + 1);
        //console.log(LinkList);
        writeDifferences({
            checksum: Checksum,
            rawData: result
        }, {
            checksum: RawHash,
            rawData: RawData
        }, Link);
    });
}
function writeHistory(obj, Link) {
    const filename = escapeNegative(Hash(Link)) + ".txt";
    const finalData = `@${Link}\n` + obj.rawData;
    (0, node_fs_1.mkdir)(HistoryPath, { recursive: true }, (err) => {
        if (err)
            throw err;
        (0, node_fs_1.writeFile)((0, node_path_1.join)(HistoryPath, filename), finalData, err => {
            if (err)
                throw err;
        });
    });
}
function writeDifferences(From, To, Link) {
    const fromID = escapeNegative(From.checksum);
    const toID = escapeNegative(To.checksum);
    const filename = fromID + "_" + toID + ".txt";
    const finalData = `@${Link}\n` + From.rawData + "\n" + "@".repeat(30) + "\n" + To.rawData;
    const linkFolderName = escapeNegative(Hash(Link));
    const LinkFolder = (0, node_path_1.join)(DiffPath, linkFolderName);
    (0, node_fs_1.mkdir)(DiffPath, { recursive: true }, (err) => {
        if (err)
            throw err;
        (0, node_fs_1.mkdir)(LinkFolder, { recursive: true }, (err) => {
            if (err)
                throw err;
            (0, node_fs_1.writeFile)((0, node_path_1.join)(LinkFolder, filename), finalData, err => {
                if (err)
                    throw err;
            });
        });
    });
}
main();
setInterval(main, interval);
function main() {
    const configLocation = (0, node_path_1.join)(__dirname, "Config.json");
    (0, node_fs_1.access)(configLocation, node_fs_1.constants.F_OK, err => {
        if (err)
            (0, node_fs_1.writeFile)(configLocation, ExConfig, err => {
                if (err)
                    throw err;
            });
        else {
            (0, node_fs_1.readFile)(configLocation, 'utf8', (err, data) => {
                if (err)
                    throw err;
                Config = JSON.parse(data);
            });
        }
    });
    // Check IF the File Exists IF NOT Creates It
    (0, node_fs_1.access)(LinkListPath, node_fs_1.constants.F_OK, err => {
        if (err) { // does not exist
            console.log(`${LinkListPath} does not exist`);
            (0, node_fs_1.writeFile)(LinkListPath, ExListInput, err => {
                if (err)
                    throw err;
                console.log(`\tThe file has been saved to file:///${LinkListPath}`);
                console.log('\tEnter links to it and then restart the program');
                (0, node_process_1.exit)(1); //exits for user to enter links
            });
        }
    });
    (0, node_fs_1.readFile)(LinkListPath, 'utf8', (err, data) => {
        if (err)
            throw err;
        LinkList = data.split("\n").filter(link => link);
        //console.log(LinkList);
        (0, node_fs_1.access)(ChecksumListPath, node_fs_1.constants.F_OK, err => {
            if (err)
                (0, node_fs_1.writeFile)(ChecksumListPath, "[]", err => {
                    if (err)
                        throw err;
                });
            else {
                (0, node_fs_1.readFile)(ChecksumListPath, 'utf8', (err, data) => {
                    if (err)
                        throw err;
                    ChecksumListRaw = JSON.parse(data);
                    ChecksumList = new Map(ChecksumListRaw.map(o => [o.link, o.checksum]));
                    for (const Link of LinkList) {
                        (0, undici_1.request)(parseLink(Link)).then(res => {
                            res.body.text().then(RawData => {
                                const RawHash = Hash(RawData);
                                if (ChecksumList.has(Link)) {
                                    const OldHash = ChecksumList.get(Link);
                                    if (OldHash != RawHash && OldHash) {
                                        // writes differences between history and current in a different file
                                        readHistory(OldHash, Link, RawHash, RawData);
                                        // writes current status into a txt file
                                        writeHistory({ checksum: RawHash, rawData: RawData }, Link);
                                        ChecksumList.set(Link, RawHash);
                                        console.log(`New Change ${OldHash} -> ${RawHash} at ${Link}`);
                                        console.log("file:///" + DiffPath + escapeNegative(OldHash) + "_" + escapeNegative(RawHash));
                                        doStuff(Link, OldHash, RawHash, RawData);
                                        writeChecksum();
                                    }
                                    else {
                                        writeHistory({ checksum: RawHash, rawData: RawData }, Link);
                                    }
                                }
                                else { //first time
                                    writeHistory({ checksum: RawHash, rawData: RawData }, Link);
                                    ChecksumList.set(Link, RawHash);
                                    console.log(`${Link} ${RawHash}`);
                                    writeChecksum();
                                }
                            }); // TEXT()
                        }).catch(err => {
                            if (err)
                                console.log(`Connection failed for ${err.address + ":" + err.port}`);
                        }); // request()
                    }
                });
            }
        });
    });
}
function writeChecksum() {
    ChecksumListRaw = Array.from(ChecksumList, ([link, checksum]) => ({ link, checksum }));
    (0, node_fs_1.writeFile)(ChecksumListPath, JSON.stringify(ChecksumListRaw), err => {
        if (err)
            throw err;
    });
}
function doStuff(Link, OldHash, RawHash, RawData) {
    if (Config) {
        if (Config.filters.length > 0)
            Config.filters.forEach(filter => Link = Link.replace(filter, "REDACTED"));
        const bot_message = `New Change ${OldHash} -> ${RawHash} at ${Link}`;
        if (Config.telegram.bot_token && Config.telegram.chat_id) {
            const link = 'https://api.telegram.org/bot' + Config.telegram.bot_token + '/sendMessage?chat_id=' + Config.telegram.chat_id + '&parse_mode=Markdown&text=' + bot_message;
            (0, undici_1.request)(link, { method: "POST" }).then(res => {
                //console.log(res.body)
            });
        }
        if (Config.gist) {
            const GistFile = (0, node_path_1.join)(__dirname, "GistList.json");
            (0, node_fs_1.readFile)(GistFile, 'utf8', (err, data) => {
                if (err)
                    throw err;
                let GistListRaw = JSON.parse(data);
                GistList = new Map(GistListRaw.map(o => [o.link, o.id]));
                const octokit = new core_1.Octokit({
                    auth: Config.gist.personalAccessToken
                });
                if (GistList.has(Link)) {
                    octokit.request('PATCH /gists/{gist_id}', {
                        gist_id: GistList.get(Link) || "0",
                        description: bot_message,
                        files: {
                            [`${escapeNegative(Hash(Link))}.txt`]: {
                                content: RawData
                            }
                        }
                    });
                }
                else {
                    octokit.request('POST /gists', {
                        description: bot_message,
                        'public': true,
                        files: {
                            [`${escapeNegative(Hash(Link))}.txt`]: {
                                content: RawData
                            }
                        }
                    }).then(res => {
                        if (res.data.id)
                            GistList.set(Link, res.data.id);
                        GistListRaw = Array.from(GistList, ([link, id]) => ({ link, id }));
                        (0, node_fs_1.writeFile)(GistFile, JSON.stringify(GistListRaw), err => {
                            if (err)
                                throw err;
                        });
                    });
                }
            });
        }
    }
}
