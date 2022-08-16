import { Octokit } from "@octokit/core";
import { access, constants, mkdir, readFile, writeFile } from 'node:fs';
import { join } from 'node:path';
import { exit } from 'node:process';
import { request } from 'undici';
const ExListInput = "https://www.example.com\nexample.org"; //Example input
const ExConfig = '{"telegram": { "bot_token": "HERE","chat_id": 1},"filters": ["REDACTED"]}';
const LinkListPath = join(__dirname, process.argv.length > 2 ? process.argv[2] : "LinkList.txt"); //IF Given Enters Argument Else Defaults 
const ChecksumListPath = join(__dirname, "ChecksumList.json");
const HistoryPath = join(__dirname, "/history/");
const DiffPath = join(__dirname, "/diff/"); //differences
const interval = 10000;

interface ChecksumObject {
    link: string;
    checksum: number;
}

interface GistObject {
    link: string;
    id: string;
}

interface config {
    telegram: {
        bot_token: string,
        chat_id: number
    },
    filters: Array<string>,
    gist: {
        accountName: string
        personalAccessToken: string
    },
}

interface LinkObject {
    rawData: string;
    checksum: number;
}

var Config: config;
var ChecksumListRaw: Array<ChecksumObject>;
var ChecksumList: Map<string, number>;
var LinkList: Array<string>;
var GistList: Map<string, string> = new Map();

function parseLink(Link: string): string {
    if (!Link.includes("http"))
        return "https://" + Link;
    return Link;
}

function Hash(text: string): number {
    var hash = 0, i, chr;
    if (text.length === 0) return hash;
    for (i = 0; i < text.length; i++) {
        chr = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}

function escapeNegative(checksum: number): string {
    return checksum >= 0 ? checksum.toString() : ("N" + Math.abs(checksum).toString());
}

function readHistory(Checksum: number, Link: string, RawHash: number, RawData: string) {
    let result;
    const filename: string = escapeNegative(Hash(Link)) + ".txt";

    readFile(join(HistoryPath, filename), 'utf8', (err, data) => {
        if (err) throw err;
        result = data.substring(data.indexOf("\n") + 1);
        //console.log(LinkList);
        writeDifferences(
            {
                checksum: Checksum,
                rawData: result
            },
            {
                checksum: RawHash,
                rawData: RawData
            }, Link);
    });

}

function writeHistory(obj: LinkObject, Link: string) {
    const filename: string = escapeNegative(Hash(Link)) + ".txt";
    const finalData = `@${Link}\n` + obj.rawData;

    mkdir(HistoryPath, { recursive: true }, (err) => {
        if (err) throw err;
        writeFile(join(HistoryPath, filename), finalData, err => { //writes the file
            if (err) throw err;
        });
    });
}

function writeDifferences(From: LinkObject, To: LinkObject, Link: string) {
    const fromID = escapeNegative(From.checksum);
    const toID = escapeNegative(To.checksum);
    const filename = fromID + "_" + toID + ".txt";
    const finalData = `@${Link}\n` + From.rawData + "\n" + "@".repeat(30) + "\n" + To.rawData;
    const linkFolderName = escapeNegative(Hash(Link));
    const LinkFolder = join(DiffPath, linkFolderName);
    mkdir(DiffPath, { recursive: true }, (err) => {
        if (err) throw err;
        mkdir(LinkFolder, { recursive: true }, (err) => {
            if (err) throw err;
            writeFile(join(LinkFolder, filename), finalData, err => { //writes the file
                if (err) throw err;
            });
        });
    });
}



main();
setInterval(main, interval);

function main(): void {
    const configLocation = join(__dirname, "Config.json");
    access(configLocation, constants.F_OK, err => {
        if (err)
            writeFile(configLocation, ExConfig, err => { //writes the file with example string
                if (err) throw err;
            });
        else {
            readFile(configLocation, 'utf8', (err, data) => { //reads checksum list
                if (err) throw err;
                Config = JSON.parse(data);

            });
        }
    });

    // Check IF the File Exists IF NOT Creates It
    access(LinkListPath, constants.F_OK, err => {
        if (err) { // does not exist
            console.log(`${LinkListPath} does not exist`);
            writeFile(LinkListPath, ExListInput, err => { //writes the file with example string
                if (err) throw err;
                console.log(`\tThe file has been saved to file:///${LinkListPath}`);
                console.log('\tEnter links to it and then restart the program');
                exit(1); //exits for user to enter links
            });
        }
    });

    readFile(LinkListPath, 'utf8', (err, data) => {
        if (err) throw err;
        LinkList = data.split("\n").filter(link => link);
        //console.log(LinkList);

        access(ChecksumListPath, constants.F_OK, err => {
            if (err)
                writeFile(ChecksumListPath, "[]", err => { //writes the file with example string
                    if (err) throw err;
                });
            else {
                readFile(ChecksumListPath, 'utf8', (err, data) => { //reads checksum list
                    if (err) throw err;
                    ChecksumListRaw = JSON.parse(data);
                    ChecksumList = new Map(ChecksumListRaw.map(o => [o.link, o.checksum]));

                    for (const Link of LinkList) {
                        request(parseLink(Link)).then(res => {
                            res.body.text().then(RawData => {
                                const RawHash = Hash(RawData);

                                if (ChecksumList.has(Link)) {
                                    const OldHash = ChecksumList.get(Link);
                                    if (OldHash != RawHash && OldHash) {
                                        // writes differences between history and current in a different file
                                        readHistory(OldHash, Link, RawHash, RawData)
                                        // writes current status into a txt file
                                        writeHistory({ checksum: RawHash, rawData: RawData }, Link);
                                        ChecksumList.set(Link, RawHash);
                                        console.log(`New Change ${OldHash} -> ${RawHash} at ${Link}`);
                                        console.log("file:///" + DiffPath + escapeNegative(OldHash) + "_" + escapeNegative(RawHash));
                                        doStuff(Link, OldHash, RawHash, RawData);
                                        writeChecksum()
                                    } else {
                                        writeHistory({ checksum: RawHash, rawData: RawData }, Link);
                                    }
                                }
                                else { //first time
                                    writeHistory({ checksum: RawHash, rawData: RawData }, Link);
                                    ChecksumList.set(Link, RawHash);
                                    console.log(`${Link} ${RawHash}`);
                                    writeChecksum()
                                }

                            }) // TEXT()
                        }).catch(err => {
                            if (err)
                                console.log(`Connection failed for ${err.address + ":" + err.port}`);
                        });// request()
                    }
                });
            }
        });

    });

}

function writeChecksum() {
    ChecksumListRaw = Array.from(ChecksumList, ([link, checksum]) => ({ link, checksum }));
    writeFile(ChecksumListPath, JSON.stringify(ChecksumListRaw), err => {
        if (err) throw err;
    });
}

function doStuff(Link: string, OldHash: number, RawHash: number, RawData: string) {
    if (Config) {
        if (Config.filters.length > 0)
            Config.filters.forEach(filter => Link = Link.replace(filter, "REDACTED"));

        const bot_message: string = `New Change ${OldHash} -> ${RawHash} at ${Link}`;
        if (Config.telegram.bot_token && Config.telegram.chat_id) {
            const link = 'https://api.telegram.org/bot' + Config.telegram.bot_token + '/sendMessage?chat_id=' + Config.telegram.chat_id + '&parse_mode=Markdown&text=' + bot_message
            request(link, { method: "POST" }).then(res => {
                //console.log(res.body)
            })
        }
        if (Config.gist) {
            const GistFile = join(__dirname, "GistList.json");
            readFile(GistFile, 'utf8', (err, data) => { //reads checksum list
                if (err) throw err;
                let GistListRaw: Array<GistObject> = JSON.parse(data);
                GistList = new Map(GistListRaw.map(o => [o.link, o.id]));
                const octokit = new Octokit({
                    auth: Config.gist.personalAccessToken
                })
                if (GistList.has(Link)) {
                    octokit.request('PATCH /gists/{gist_id}', {
                        gist_id: GistList.get(Link) || "0",
                        description: bot_message,
                        files: {
                            [`${escapeNegative(Hash(Link))}.txt`]: {
                                content: RawData
                            }
                        }
                    })
                } else {
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
                        writeFile(GistFile, JSON.stringify(GistListRaw), err => {
                            if (err) throw err;
                        });
                    })
                }
            })


        }
    }

}